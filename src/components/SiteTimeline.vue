<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import {
  getDefaultSiteSettings,
  getSiteSettings,
  getSiteSettingsStorageKey,
  normalizeSiteSettings,
  setSiteSettings,
  type SiteSettings,
  type SupportedSite
} from "../lib/site-settings"

type TimelineNode = {
  id: string
  order: number
  role: "user" | "assistant"
  text: string
}

type CollectedNode = {
  id: string
  role: "user" | "assistant"
  text: string
  element: HTMLElement
}

type HierarchyMeta = {
  level: number
  folded: boolean
}

type ContextMenuState = {
  nodeId: string
  x: number
  y: number
}

const props = defineProps<{
  siteId: SupportedSite["id"]
  highlightClassName: string
  collectNodes: () => CollectedNode[]
  resolveTarget?: (
    messageId: string,
    elementMap: Map<string, HTMLElement>
  ) => HTMLElement | null
  scrollContainerSelector?: string
}>()

const maxVisibleDots = 18
const maxHierarchyLevel = 3
const settingsKey = getSiteSettingsStorageKey(location.hostname)
const routeChangeEventName = `plasmo-${props.siteId}-route-change`
const highlightStyleId = `plasmo-${props.siteId}-timeline-highlight-style`

const nodes = ref<TimelineNode[]>([])
const settings = ref<SiteSettings>(getDefaultSiteSettings())
const search = ref("")
const panelOpen = ref(false)
const hoveredNodeId = ref<string | null>(null)
const contextMenu = ref<ContextMenuState | null>(null)
const widgetRef = ref<HTMLElement | null>(null)

let observer: MutationObserver | null = null
let collectTimer: ReturnType<typeof setTimeout> | null = null
let routePollTimer: ReturnType<typeof setInterval> | null = null
let unpatchHistory: (() => void) | null = null
let ownHighlightStyle: HTMLStyleElement | null = null
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null
let dragCleanup: (() => void) | null = null
let scrollPreserveTimer: ReturnType<typeof setTimeout> | null = null
let autoScrollUnlockTimer: ReturnType<typeof setTimeout> | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let scrollCollectTimer: ReturnType<typeof setTimeout> | null = null
let lastObservedUrl = ""
let suppressAutoScrollUntil = 0

const elementByNodeId = new Map<string, HTMLElement>()
const hierarchyMetaByNodeId = ref<Record<string, HierarchyMeta>>({})

const normalizeText = (raw: string) => raw.replace(/\s+/g, " ").trim()

const toPreview = (text: string, maxLength = 48) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}...` : text

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const getHierarchyStorageKey = () =>
  `timeline-hierarchy-v1:${props.siteId}:${location.pathname}${location.search}`

const getNodeMeta = (nodeId: string): HierarchyMeta =>
  hierarchyMetaByNodeId.value[nodeId] ?? { level: 0, folded: false }

const persistHierarchyState = () => {
  try {
    sessionStorage.setItem(
      getHierarchyStorageKey(),
      JSON.stringify(hierarchyMetaByNodeId.value)
    )
  } catch (error) {
    console.warn(`[${props.siteId} timeline] persist hierarchy failed`, error)
  }
}

const loadHierarchyState = () => {
  try {
    const raw = sessionStorage.getItem(getHierarchyStorageKey())
    if (!raw) {
      hierarchyMetaByNodeId.value = {}
      return
    }

    const parsed = JSON.parse(raw) as Record<string, Partial<HierarchyMeta>>
    const nextState: Record<string, HierarchyMeta> = {}
    for (const [nodeId, meta] of Object.entries(parsed)) {
      nextState[nodeId] = {
        level: clamp(
          typeof meta.level === "number" ? Math.round(meta.level) : 0,
          0,
          maxHierarchyLevel
        ),
        folded: Boolean(meta.folded)
      }
    }
    hierarchyMetaByNodeId.value = nextState
  } catch (error) {
    console.warn(`[${props.siteId} timeline] load hierarchy failed`, error)
    hierarchyMetaByNodeId.value = {}
  }
}

const applyHierarchyMutation = (
  nodeId: string,
  mutator: (current: HierarchyMeta) => HierarchyMeta
) => {
  const nextState = { ...hierarchyMetaByNodeId.value }
  nextState[nodeId] = mutator(getNodeMeta(nodeId))
  hierarchyMetaByNodeId.value = nextState
  persistHierarchyState()
}

const currentConversationNodes = computed(() => {
  if (!settings.value.timelineEnableNodeHierarchy) {
    return nodes.value
  }

  const result: TimelineNode[] = []
  let foldedLevel: number | null = null

  for (const node of nodes.value) {
    const meta = getNodeMeta(node.id)
    if (foldedLevel !== null) {
      if (meta.level > foldedLevel) {
        continue
      }
      foldedLevel = null
    }

    result.push(node)
    if (meta.folded) {
      foldedLevel = meta.level
    }
  }

  return result
})

const filteredNodes = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  const source = keyword ? nodes.value : currentConversationNodes.value
  if (!keyword) {
    return source
  }

  return source.filter((node) => node.text.toLowerCase().includes(keyword))
})

const visibleNodes = computed(() => {
  const source = currentConversationNodes.value
  if (source.length <= maxVisibleDots) {
    return source
  }

  const sampled: TimelineNode[] = []
  const seenIndexes = new Set<number>()

  for (let i = 0; i < maxVisibleDots; i += 1) {
    const index = Math.round((i * (source.length - 1)) / (maxVisibleDots - 1))
    if (seenIndexes.has(index)) {
      continue
    }
    seenIndexes.add(index)
    sampled.push(source[index])
  }

  return sampled
})

const widgetStyle = computed(() => {
  const r = settings.value.timelineRight
  // If user has old settings (10px), we can't easily force it to 0 without overwriting,
  // but we can make sure 0 is actually 0.
  return {
    top: `${settings.value.timelineTop}px`,
    right: `${r}px`
  }
})

const getNodeTop = (index: number, total: number) => {
  if (total <= 1) {
    return "0%"
  }

  const step = 100 / (total - 1)
  return `${Math.min(100, Math.max(0, index * step))}%`
}

const getNodeLevel = (nodeId: string) =>
  settings.value.timelineEnableNodeHierarchy ? getNodeMeta(nodeId).level : 0

const getNodeStyle = (nodeId: string, index: number, total: number) => ({
  top: getNodeTop(index, total),
  "--timeline-node-level": String(getNodeLevel(nodeId))
})

const getListItemStyle = (nodeId: string) => ({
  "--timeline-node-indent": `${getNodeLevel(nodeId) * 14}px`
})

const isNearBottom = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 80

const findScrollableContainer = () => {
  const iterator = elementByNodeId.values().next()
  let current = iterator.done ? null : iterator.value

  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 24
    if (canScroll) {
      return current
    }
    current = current.parentElement
  }

  return document.scrollingElement as HTMLElement | null
}

const maybePreserveScrollPosition = () => {
  if (!settings.value.timelinePreventAutoJump || Date.now() < suppressAutoScrollUntil) {
    return
  }

  const scroller = findScrollableContainer()
  if (!scroller || isNearBottom(scroller)) {
    return
  }

  const previousTop = scroller.scrollTop
  if (scrollPreserveTimer) {
    clearTimeout(scrollPreserveTimer)
  }

  scrollPreserveTimer = setTimeout(() => {
    if (Date.now() < suppressAutoScrollUntil) {
      return
    }

    const nextTop = scroller.scrollTop
    if (Math.abs(nextTop - previousTop) > 32) {
      scroller.scrollTo({
        top: previousTop,
        behavior: "auto"
      })
    }
  }, 90)
}

const collectTimeline = () => {
  const collectedNodes = props.collectNodes()
  const nextNodes: TimelineNode[] = []
  elementByNodeId.clear()

  for (let index = 0; index < collectedNodes.length; index += 1) {
    const item = collectedNodes[index]
    const text = normalizeText(item.text)
    if (!text) {
      continue
    }

    nextNodes.push({
      id: item.id,
      order: nextNodes.length + 1,
      role: item.role,
      text
    })
    elementByNodeId.set(item.id, item.element)
  }

  nodes.value = nextNodes
}

const scheduleCollectTimeline = () => {
  maybePreserveScrollPosition()

  if (collectTimer) {
    clearTimeout(collectTimer)
  }

  collectTimer = setTimeout(() => {
    collectTimeline()
  }, 120)
}

const withTemporaryAutoScrollAllowance = () => {
  suppressAutoScrollUntil = Date.now() + 1400
  if (autoScrollUnlockTimer) {
    clearTimeout(autoScrollUnlockTimer)
  }

  autoScrollUnlockTimer = setTimeout(() => {
    suppressAutoScrollUntil = 0
  }, 1500)
}

const scrollToMessage = (messageId: string) => {
  withTemporaryAutoScrollAllowance()

  const target =
    props.resolveTarget?.(messageId, elementByNodeId) ??
    elementByNodeId.get(messageId) ??
    null
  if (!target) {
    return
  }

  target.scrollIntoView({
    behavior: settings.value.timelineScrollMode === "flow" ? "smooth" : "auto",
    block: "center"
  })

  target.classList.add(props.highlightClassName)
  setTimeout(() => {
    target.classList.remove(props.highlightClassName)
  }, 1100)
}

const ensureHighlightStyle = () => {
  const existing = document.getElementById(highlightStyleId)
  if (existing) {
    return
  }

  const style = document.createElement("style")
  style.id = highlightStyleId
  style.textContent = `
    .${props.highlightClassName} {
      outline: 2px solid rgba(71, 126, 255, 0.78) !important;
      outline-offset: 2px !important;
      border-radius: 14px !important;
      background: rgba(86, 136, 255, 0.12) !important;
      transition: background-color 0.2s ease !important;
    }
  `

  document.documentElement.appendChild(style)
  ownHighlightStyle = style
}

const persistCurrentSettings = async (partial?: Partial<SiteSettings>) => {
  const nextSettings = normalizeSiteSettings({
    ...settings.value,
    ...(partial ?? {})
  })
  settings.value = nextSettings
  await setSiteSettings(location.hostname, nextSettings)
}

const loadSiteSettings = async () => {
  settings.value = await getSiteSettings(location.hostname)
}

const ensureWidgetWithinViewport = async () => {
  const widget = widgetRef.value
  if (!widget) {
    return
  }

  const maxTop = Math.max(0, window.innerHeight - widget.offsetHeight - 8)
  const maxRight = Math.max(0, window.innerWidth - 32)
  const nextTop = clamp(settings.value.timelineTop, 0, maxTop)
  const nextRight = clamp(settings.value.timelineRight, 0, maxRight)

  if (nextTop === settings.value.timelineTop && nextRight === settings.value.timelineRight) {
    return
  }

  await persistCurrentSettings({
    timelineTop: nextTop,
    timelineRight: nextRight
  })
}

const handleWindowResize = () => {
  if (resizeTimer) {
    clearTimeout(resizeTimer)
  }

  resizeTimer = setTimeout(() => {
    void ensureWidgetWithinViewport()
  }, 120)
}

const listenSettingsChange = () => {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged?.addListener) {
    return
  }

  storageListener = (changes, areaName) => {
    if (areaName !== "sync" || !changes[settingsKey]) {
      return
    }

    settings.value = normalizeSiteSettings(changes[settingsKey].newValue)
  }

  chrome.storage.onChanged.addListener(storageListener)
}

const openContextMenu = (event: MouseEvent, nodeId: string) => {
  if (!settings.value.timelineEnableNodeHierarchy) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  contextMenu.value = {
    nodeId,
    x: clamp(event.clientX - 168, 8, Math.max(8, window.innerWidth - 188)),
    y: clamp(event.clientY - 8, 8, Math.max(8, window.innerHeight - 140))
  }
}

const closeContextMenu = () => {
  contextMenu.value = null
}

const increaseNodeLevel = () => {
  if (!contextMenu.value) {
    return
  }

  applyHierarchyMutation(contextMenu.value.nodeId, (current) => ({
    ...current,
    level: clamp(current.level + 1, 0, maxHierarchyLevel)
  }))
}

const decreaseNodeLevel = () => {
  if (!contextMenu.value) {
    return
  }

  applyHierarchyMutation(contextMenu.value.nodeId, (current) => ({
    ...current,
    level: clamp(current.level - 1, 0, maxHierarchyLevel)
  }))
}

const toggleNodeFold = () => {
  if (!contextMenu.value) {
    return
  }

  applyHierarchyMutation(contextMenu.value.nodeId, (current) => ({
    ...current,
    folded: !current.folded
  }))
}

const beginDrag = (event: PointerEvent) => {
  if (!settings.value.timelineDraggable) {
    return
  }

  const target = event.target as HTMLElement | null
  if (!target?.closest("[data-drag-handle='true']")) {
    return
  }

  if (target.closest(".doubao-timeline-dot, .doubao-timeline-panel")) {
    return
  }

  const widget = widgetRef.value
  if (!widget) {
    return
  }

  event.preventDefault()
  closeContextMenu()

  const startX = event.clientX
  const startY = event.clientY
  const startTop = settings.value.timelineTop
  const startRight = settings.value.timelineRight

  const onPointerMove = (moveEvent: PointerEvent) => {
    const nextTop = clamp(
      startTop + (moveEvent.clientY - startY),
      0,
      Math.max(0, window.innerHeight - widget.offsetHeight - 8)
    )
    const nextRight = clamp(
      startRight - (moveEvent.clientX - startX),
      0,
      Math.max(0, window.innerWidth - 32)
    )

    settings.value = normalizeSiteSettings({
      ...settings.value,
      timelineTop: nextTop,
      timelineRight: nextRight
    })
  }

  const onPointerUp = async () => {
    window.removeEventListener("pointermove", onPointerMove, true)
    window.removeEventListener("pointerup", onPointerUp, true)
    dragCleanup = null
    await persistCurrentSettings({
      timelineTop: settings.value.timelineTop,
      timelineRight: settings.value.timelineRight
    })
  }

  dragCleanup?.()
  dragCleanup = () => {
    window.removeEventListener("pointermove", onPointerMove, true)
    window.removeEventListener("pointerup", onPointerUp, true)
  }

  window.addEventListener("pointermove", onPointerMove, true)
  window.addEventListener("pointerup", onPointerUp, true)
}

const observeTimelineSource = () => {
  observer?.disconnect()

  observer = new MutationObserver(() => {
    scheduleCollectTimeline()
  })

  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true
  })
}

const setupRouteRefresh = () => {
  const onRouteChanged = () => {
    const currentUrl = location.href
    if (currentUrl === lastObservedUrl) {
      return
    }

    lastObservedUrl = currentUrl
    search.value = ""
    panelOpen.value = false
    loadHierarchyState()
    scheduleCollectTimeline()
    setTimeout(() => {
      collectTimeline()
    }, 320)
  }

  const patchHistoryMethod = (method: "pushState" | "replaceState") => {
    const original = history[method]
    const patched = function patchedHistoryState(
      this: History,
      ...args: Parameters<typeof original>
    ) {
      const result = Reflect.apply(
        original as (...innerArgs: unknown[]) => unknown,
        this,
        args as unknown[]
      )
      window.dispatchEvent(new Event(routeChangeEventName))
      return result
    } as typeof original
    history[method] = patched

    return () => {
      history[method] = original
    }
  }

  const restorePushState = patchHistoryMethod("pushState")
  const restoreReplaceState = patchHistoryMethod("replaceState")

  window.addEventListener(routeChangeEventName, onRouteChanged)
  window.addEventListener("popstate", onRouteChanged)
  window.addEventListener("hashchange", onRouteChanged)

  unpatchHistory = () => {
    restorePushState()
    restoreReplaceState()
    window.removeEventListener(routeChangeEventName, onRouteChanged)
    window.removeEventListener("popstate", onRouteChanged)
    window.removeEventListener("hashchange", onRouteChanged)
  }

  routePollTimer = setInterval(() => {
    if (location.href !== lastObservedUrl) {
      window.dispatchEvent(new Event(routeChangeEventName))
    }
  }, 1200)
}

onMounted(async () => {
  await loadSiteSettings()
  await nextTick()
  await ensureWidgetWithinViewport()
  loadHierarchyState()
  ensureHighlightStyle()
  lastObservedUrl = location.href
  collectTimeline()
  observeTimelineSource()
  setupRouteRefresh()
  listenSettingsChange()
  window.addEventListener("click", closeContextMenu, true)
  window.addEventListener("resize", handleWindowResize, { passive: true })

  // 延迟重试，给虚拟列表多一点时间渲染
  setTimeout(() => collectTimeline(), 300)
  setTimeout(() => collectTimeline(), 800)

  // 自动预加载：快速滚动一小段，触发虚拟列表渲染更多 DOM，然后滚回原位
  const tryPreloadVirtualList = async () => {
    try {
      // 1. 尝试找到滚动容器
      let scrollContainer: HTMLElement | null = null
      if (props.scrollContainerSelector) {
        const selectors = props.scrollContainerSelector.split(",").map(s => s.trim()).filter(Boolean)
        for (const sel of selectors) {
          const el = document.querySelector(sel) as HTMLElement
          if (el) {
            scrollContainer = el
            break
          }
        }
      }
      if (!scrollContainer) {
        scrollContainer = document.querySelector('main') as HTMLElement || document.documentElement
      }

      // 2. 保存原始位置
      const originalScrollTop = scrollContainer.scrollTop
      const originalScrollHeight = scrollContainer.scrollHeight

      // 3. 快速往上滚一小段，然后再滚回来，触发虚拟列表渲染
      const smallJump = 400 // 像素
      const maxPreloadAttempts = 2
      let preloadCount = 0

      const runPreloadCycle = () => {
        if (preloadCount >= maxPreloadAttempts) {
          // 最后滚回原位
          scrollContainer.scrollTop = originalScrollTop
          collectTimeline()
          return
        }

        preloadCount++
        const currentTop = scrollContainer.scrollTop
        // 往上滚一点
        scrollContainer.scrollTop = Math.max(0, currentTop - smallJump)

        // 等一小会儿，让页面渲染
        setTimeout(() => {
          // 采集一下，然后继续下一轮
          collectTimeline()
          setTimeout(runPreloadCycle, 80)
        }, 60)
      }

      // 等页面稍微稳定了再开始预加载
      setTimeout(runPreloadCycle, 1200)
    } catch (e) {
      // 预加载失败不影响主功能
      console.debug("[Timeline] Preload skipped", e)
    }
  }

  tryPreloadVirtualList()

  // 监听滚动事件，滚动时也去重新采集节点
  const handleScroll = () => {
    if (scrollCollectTimer) {
      clearTimeout(scrollCollectTimer)
    }
    scrollCollectTimer = setTimeout(() => {
      collectTimeline()
    }, 100)
  }

  window.addEventListener("scroll", handleScroll, { passive: true, capture: true })

    // 保存清理函数
    ; (window as any).__plasmoTimelineScrollCleanup = () => {
      window.removeEventListener("scroll", handleScroll, true)
      if (scrollCollectTimer) {
        clearTimeout(scrollCollectTimer)
        scrollCollectTimer = null
      }
    }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null

  if (collectTimer) {
    clearTimeout(collectTimer)
    collectTimer = null
  }

  if (routePollTimer) {
    clearInterval(routePollTimer)
    routePollTimer = null
  }

  if (scrollPreserveTimer) {
    clearTimeout(scrollPreserveTimer)
    scrollPreserveTimer = null
  }

  if (autoScrollUnlockTimer) {
    clearTimeout(autoScrollUnlockTimer)
    autoScrollUnlockTimer = null
  }

  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }

  if (scrollCollectTimer) {
    clearTimeout(scrollCollectTimer)
    scrollCollectTimer = null
  }

  // 调用之前保存的滚动监听清理函数
  const cleanup = (window as any).__plasmoTimelineScrollCleanup
  if (typeof cleanup === "function") {
    cleanup()
  }

  if (unpatchHistory) {
    unpatchHistory()
    unpatchHistory = null
  }

  dragCleanup?.()
  dragCleanup = null

  if (storageListener && typeof chrome !== "undefined" && chrome.storage?.onChanged?.removeListener) {
    chrome.storage.onChanged.removeListener(storageListener)
  }
  storageListener = null

  window.removeEventListener("click", closeContextMenu, true)
  window.removeEventListener("resize", handleWindowResize)

  if (ownHighlightStyle?.parentNode) {
    ownHighlightStyle.parentNode.removeChild(ownHighlightStyle)
  }
  ownHighlightStyle = null
})
</script>

<template>
  <aside v-if="settings.enabled" ref="widgetRef" class="doubao-timeline-widget" :class="{
    'minimal-shell': settings.timelineHideOutsideContainer,
    'hierarchy-enabled': settings.timelineEnableNodeHierarchy,
    'drag-enabled': settings.timelineDraggable
  }" :style="widgetStyle" @pointerdown="beginDrag">
    <button class="doubao-timeline-toggle" type="button" title="打开消息搜索" :disabled="nodes.length === 0"
      @click="panelOpen = !panelOpen">
      ≡
    </button>

    <div class="doubao-timeline-track" :class="{ 'hierarchy-enabled': settings.timelineEnableNodeHierarchy }"
      data-drag-handle="true">
      <div class="doubao-timeline-line"></div>

      <button v-for="(node, index) in visibleNodes" :key="node.id" class="doubao-timeline-dot" :class="{
        active: hoveredNodeId === node.id,
        user: node.role === 'user',
        folded: settings.timelineEnableNodeHierarchy && getNodeMeta(node.id).folded
      }" :style="getNodeStyle(node.id, index, visibleNodes.length)" type="button" @mouseenter="hoveredNodeId = node.id"
        @mouseleave="hoveredNodeId = null" @contextmenu="openContextMenu($event, node.id)"
        @click="scrollToMessage(node.id)">
        <span class="doubao-timeline-tip">{{ node.order }}. {{ toPreview(node.text, 60) }}</span>
      </button>

      <span v-if="nodes.length === 0" class="doubao-timeline-empty-dot" title="未抓到消息节点"></span>
    </div>

    <section v-if="panelOpen && nodes.length > 0" class="doubao-timeline-panel">
      <input v-model="search" class="doubao-timeline-search" type="search" placeholder="搜索..."
        @keydown.esc.prevent="panelOpen = false" />

      <ol class="doubao-timeline-list">
        <li v-for="node in filteredNodes" :key="node.id" class="doubao-timeline-item">
          <button class="doubao-timeline-item-btn" :style="getListItemStyle(node.id)" type="button" :title="node.text"
            @contextmenu="openContextMenu($event, node.id)" @click="scrollToMessage(node.id)">
            <span class="order">{{ node.order }}</span>
            <span v-if="settings.timelineEnableNodeHierarchy && getNodeMeta(node.id).folded" class="fold-flag">
              ▸
            </span>
            <span class="text">{{ toPreview(node.text, 80) }}</span>
          </button>
        </li>
      </ol>
    </section>

    <div v-if="contextMenu && settings.timelineEnableNodeHierarchy" class="doubao-timeline-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
      <button type="button" @click="increaseNodeLevel">增加层级</button>
      <button type="button" @click="decreaseNodeLevel">降低层级</button>
      <button type="button" @click="toggleNodeFold">
        {{ getNodeMeta(contextMenu.nodeId).folded ? "展开子节点" : "折叠子节点" }}
      </button>
    </div>
  </aside>
</template>
