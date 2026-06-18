<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue"
import PromptEditor from "~/components/PromptEditor.vue"
import PromptPanel from "~/components/PromptPanel.vue"

const isExpanded = ref(false)
const isDragging = ref(false)

const containerRef = ref<HTMLElement | null>(null)
const promptBtnRef = ref<HTMLElement | null>(null)
const showPromptPanel = ref(false)
const showPromptEditor = ref(false)

function onOpenEditor() {
  showPromptPanel.value = false
  showPromptEditor.value = true
}

// ── 悬停延迟展开 ──
let hoverTimer: ReturnType<typeof setTimeout> | null = null
const HOVER_DWELL_MS = 300

function onMouseEnter() {
  if (isDragging.value) return
  clearTimeout(hoverTimer!)
  hoverTimer = setTimeout(() => {
    isExpanded.value = true
    hoverTimer = null
  }, HOVER_DWELL_MS)
}

function onMouseLeave() {
  if (isDragging.value) return
  clearTimeout(hoverTimer!)
  hoverTimer = null
  isExpanded.value = false
}

// ── 拖拽 ──
let dragStartX = 0
let dragStartY = 0
let origTranslateX = 0
let origTranslateY = 0
let dragTimer: ReturnType<typeof setTimeout> | null = null
let suppressClick = false

function getCurrentTranslate(): { x: number; y: number } {
  if (!containerRef.value) return { x: 0, y: 0 }
  const style = getComputedStyle(containerRef.value)
  const matrix = new DOMMatrixReadOnly(style.transform)
  return { x: matrix.m41, y: matrix.m42 }
}

function setTranslate(x: number, y: number) {
  if (!containerRef.value) return
  containerRef.value.style.transform = `translate(${x}px, ${y}px)`
}

function resetPosition() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = window.innerWidth - rect.width - 16
  const y = window.innerHeight / 2 - rect.height / 2
  setTranslate(x, y)
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  suppressClick = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  ;({ x: origTranslateX, y: origTranslateY } = getCurrentTranslate())

  dragTimer = setTimeout(() => {
    dragTimer = null
    suppressClick = true
    if (!containerRef.value) return
    containerRef.value.setPointerCapture(e.pointerId)
    isDragging.value = true
    isExpanded.value = false
  }, 220)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) {
    if (dragTimer) {
      if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 6) {
        clearTimeout(dragTimer!)
        dragTimer = null
      }
    }
    return
  }

  e.preventDefault()
  setTranslate(
    origTranslateX + (e.clientX - dragStartX),
    origTranslateY + (e.clientY - dragStartY),
  )
}

function onPointerUp(e: PointerEvent) {
  clearTimeout(dragTimer!)
  dragTimer = null
  if (isDragging.value) {
    containerRef.value?.releasePointerCapture(e.pointerId)
    isDragging.value = false
  }
}

function onClickCapture(e: MouseEvent) {
  if (suppressClick) {
    e.preventDefault()
    e.stopPropagation()
    suppressClick = false
  }
}

// ── 导航（选择器优先级）──
// doubao 虚拟列表：一条 AI 回复可能被拆成多个 v_list_row（thinking、search、text），
// 需要按"轮次"分组：用户消息（有 justify-end）各算一轮，连续 AI 块合并为一轮。
// 兜底选择器用于非 doubao 平台（如 Kimi）
const FALLBACK_SELECTORS = [
  '[data-target-id="message-box-target-id"]:has([data-message-id])',
  "[data-message-id]",
  '[data-testid="message-block-container"]',
]

// 虚拟滚动容器选择器（doubao 用 contain: strict 的虚拟列表）
const VIRTUAL_SCROLLER_SELECTORS = [
  '[class*="v_list_scroller"]',
  '[data-name="scroll_holder"]',
]

/**
 * 将 block 级别的元素合并为消息轮次。
 * - 带 justify-end 的块是用户消息，独立成一轮
 * - 连续的无 justify-end 的块合并为一轮（一条 AI 回复的多个子块）
 */
function groupIntoMessageTurns(blocks: Element[]): { turns: Element[]; groups: number[] } {
  const turns: Element[] = []
  const groups: number[] = [] // 每个 turn 包含多少个原始 block
  let aiGroup: Element[] = []

  for (const block of blocks) {
    const isUserMsg = block.querySelector('[data-foundation-type="send-message-action-bar"]') !== null

    if (isUserMsg) {
      // 先提交之前的 AI 组
      if (aiGroup.length > 0) {
        turns.push(aiGroup[0])
        groups.push(aiGroup.length)
        aiGroup = []
      }
      // 用户消息独立一轮
      turns.push(block)
      groups.push(1)
    } else {
      aiGroup.push(block)
    }
  }

  // 最后一组 AI 块
  if (aiGroup.length > 0) {
    turns.push(aiGroup[0])
    groups.push(aiGroup.length)
  }

  return { turns, groups }
}

function findAllMessages(): Element[] {
  // doubao 虚拟列表块级选择器 → 合并为轮次
  const blockRows = document.querySelectorAll('[data-observe-row^="block_"]')
  if (blockRows.length > 0) {
    const { turns } = groupIntoMessageTurns(Array.from(blockRows))
    // 诊断日志
    console.group(
      `[FloatingButton] findAllMessages selector="[data-observe-row^=block_]" ` +
      `blocks=${blockRows.length} turns=${turns.length}`,
    )
    turns.forEach((el, i) => {
      const rect = el.getBoundingClientRect()
      const label = el.getAttribute("data-observe-row") || ""
      console.log(
        `  [${i}] id=${label.slice(0, 24)}… ` +
        `top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)} ` +
        `height=${Math.round(rect.height)} visible=${rect.bottom > 0 && rect.top < window.innerHeight}`,
      )
    })
    console.groupEnd()
    return turns
  }

  // 兜底选择器（非 doubao 平台）
  for (const sel of FALLBACK_SELECTORS) {
    const els = Array.from(document.querySelectorAll(sel))
    if (els.length > 0) return els
  }
  return []
}

function findScrollContainer(): HTMLElement | null {
  for (const sel of VIRTUAL_SCROLLER_SELECTORS) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (el) return el
  }
  return null
}

function getClosestToViewportCenter(messages: Element[]): { el: Element; index: number } | null {
  const viewCenter = window.innerHeight / 2
  let best: Element | null = null
  let bestIdx = -1
  let bestDist = Infinity

  messages.forEach((msg, i) => {
    const rect = msg.getBoundingClientRect()
    // 跳过完全在视口外的
    if (rect.bottom < 0 || rect.top > window.innerHeight) return
    const msgCenter = rect.top + rect.height / 2
    const dist = Math.abs(msgCenter - viewCenter)
    if (dist < bestDist) {
      bestDist = dist
      best = msg
      bestIdx = i
    }
  })

  return best ? { el: best, index: bestIdx } : null
}

/**
 * 手动滚动到目标元素（绕过虚拟滚动的 contain: strict 限制）
 * scrollIntoView 对虚拟滚动容器可能无效，改为直接操作 scrollTop
 */
function scrollToElement(el: Element) {
  const scroller = findScrollContainer()

  if (scroller) {
    // 虚拟滚动模式：计算并设置 scrollTop
    const elRect = el.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const targetCenter = elRect.top - scrollerRect.top + scroller.scrollTop + elRect.height / 2
    const scrollTo = targetCenter - scrollerRect.height / 2

    console.log(
      `[FloatingButton] virtual-scroll: scrollTop ${scroller.scrollTop} → ${Math.round(scrollTo)}`,
    )
    scroller.scrollTo({ top: Math.max(0, scrollTo), behavior: "smooth" })
  } else {
    // 非虚拟滚动：用原生 scrollIntoView
    console.log("[FloatingButton] native scrollIntoView")
    el.scrollIntoView({ behavior: "smooth", block: "center" })
  }
}

function scrollToPrevMessage() {
  console.log("[FloatingButton] scrollToPrevMessage")
  const messages = findAllMessages()
  console.log("[FloatingButton] found messages:", messages.length)
  if (!messages.length) return

  const current = getClosestToViewportCenter(messages)
  console.log("[FloatingButton] current index:", current?.index)

  if (!current || current.index <= 0) {
    scrollToElement(messages[0])
    return
  }
  scrollToElement(messages[current.index - 1])
}

function scrollToNextMessage() {
  console.log("[FloatingButton] scrollToNextMessage")
  const messages = findAllMessages()
  console.log("[FloatingButton] found messages:", messages.length)
  if (!messages.length) return

  const current = getClosestToViewportCenter(messages)
  console.log("[FloatingButton] current index:", current?.index)

  if (!current || current.index >= messages.length - 1) {
    scrollToElement(messages[messages.length - 1])
    return
  }
  scrollToElement(messages[current.index + 1])
}

onMounted(async () => {
  await nextTick()
  resetPosition()
  window.addEventListener("resize", resetPosition)
})

onUnmounted(() => {
  window.removeEventListener("resize", resetPosition)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="containerRef"
      class="floating-btn-group"
      :class="{ expanded: isExpanded, dragging: isDragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
      @click.capture="onClickCapture"
    >
      <!-- 拖拽手柄 -->
      <div class="drag-handle" />

      <!-- 主图标 -->
      <button class="floating-btn main-btn" type="button" title="ChatKit">
        <svg
          class="main-icon"
          width="22" height="22"
          viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
          <path d="M4 20l1-3.5L8.5 18z" />
          <path d="M20 20l-1-3.5L15.5 18z" />
        </svg>
      </button>

      <!-- 分隔线 -->
      <div class="divider" />

      <!-- 上一条消息 -->
      <button
        class="floating-btn nav-btn"
        type="button"
        title="上一条消息"
        @click.stop="scrollToPrevMessage"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>

      <!-- 提示词注入 -->
      <button
        ref="promptBtnRef"
        class="floating-btn nav-btn prompt-btn"
        type="button"
        title="提示词注入"
        @click.stop="showPromptPanel = !showPromptPanel"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z" />
        </svg>
      </button>

      <!-- 编辑提示词 -->
      <button
        class="floating-btn nav-btn edit-btn"
        type="button"
        title="编辑提示词"
        @click.stop="showPromptEditor = !showPromptEditor"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      <!-- 下一条消息 -->
      <button
        class="floating-btn nav-btn"
        type="button"
        title="下一条消息"
        @click.stop="scrollToNextMessage"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      </button>
    </div>

    <!-- 提示词面板 -->
    <PromptPanel
      :visible="showPromptPanel"
      :anchor-el="promptBtnRef"
      @close="showPromptPanel = false"
      @open-editor="onOpenEditor"
    />

    <!-- 编辑提示词面板 -->
    <PromptEditor
      :visible="showPromptEditor"
      @close="showPromptEditor = false"
    />
  </Teleport>
</template>

<style scoped>
/* ── 容器 ── */
.floating-btn-group {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 6px;
  width: 52px;
  min-height: 52px;
  box-sizing: border-box;
  z-index: 9998;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  touch-action: none;
  overflow: hidden;

  /* 折叠态：品牌色正圆形 */
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);

  transition:
    background 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    border-color 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    border-radius 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ── 展开态 ── */
.floating-btn-group.expanded {
  /* 玻璃胶囊 */
  background: rgba(250, 250, 250, 0.72);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border-color: rgba(229, 229, 229, 0.7);
  border-radius: 26px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.06),
    inset 0 1px 1px rgba(255, 255, 255, 0.8);
}

/* ── 拖拽态 ── */
.floating-btn-group.dragging {
  cursor: grabbing;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
}

/* ── 折叠态 hover ── */
.floating-btn-group:not(.expanded):not(.dragging):hover {
  background: rgba(99, 102, 241, 0.2);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
}

/* ── 拖拽手柄 ── */
.drag-handle {
  width: 24px;
  height: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translateY(-10px) scale(0.8);
  transition:
    all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-btn-group.expanded .drag-handle {
  height: 4px;
  margin: 4px auto 6px;
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
  transform: translateY(0) scale(1);
}

.floating-btn-group.dragging .drag-handle {
  width: 16px;
  background: rgba(99, 102, 241, 0.6);
}

/* ── 分隔线 ── */
.divider {
  width: 20px;
  height: 0;
  background: rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translateY(-10px) scale(0.8);
  transition:
    all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-btn-group.expanded .divider {
  height: 1px;
  margin: 2px 0;
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
  transform: translateY(0) scale(1);
  transition-delay: 0.05s;
}

/* ── 按钮 ── */
.floating-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(0, 0, 0, 0.45);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.floating-btn:hover {
  transform: scale(1.08);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.85);
}

.floating-btn-group.dragging .floating-btn {
  pointer-events: none;
}
.floating-btn-group.dragging .floating-btn:hover {
  transform: none;
  background: transparent;
}

/* ── 主图标按钮 ── */
.main-btn {
  background: transparent;
  box-shadow: none;
  color: rgba(99, 102, 241, 1);
}

.floating-btn-group.expanded .main-btn {
  background: rgba(99, 102, 241, 0.12);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
}

.main-btn:hover {
  background: rgba(99, 102, 241, 0.24) !important;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
  transform: scale(1.05);
}

/* 折叠态：hover 由容器承担 */
.floating-btn-group:not(.expanded) .main-btn:hover {
  transform: none;
  background: transparent !important;
  box-shadow: none !important;
}

.main-icon {
  display: block;
  width: 22px;
  height: 22px;
}

/* ── 导航按钮 ── */
.nav-btn {
  height: 0;
  margin: 0;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translateY(-10px) scale(0.8);
  transition:
    all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-btn-group.expanded .nav-btn {
  height: 38px;
  margin: 2px 0;
  padding: initial;
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
  transform: translateY(0) scale(1);
}

.floating-btn-group.expanded button.nav-btn:nth-of-type(2) {
  transition-delay: 0.06s;
}
.floating-btn-group.expanded button.nav-btn:nth-of-type(3) {
  transition-delay: 0.11s;
}
.floating-btn-group.expanded button.nav-btn:nth-of-type(4) {
  transition-delay: 0.16s;
}
.floating-btn-group.expanded button.nav-btn:nth-of-type(5) {
  transition-delay: 0.21s;
}

/* ── 提示词按钮 ── */
.prompt-btn {
  color: rgba(245, 158, 11, 0.7) !important;
}

.prompt-btn:hover {
  background: rgba(245, 158, 11, 0.12) !important;
  color: rgba(245, 158, 11, 1) !important;
}

.nav-btn:active {
  transform: scale(0.92) !important;
  background: rgba(99, 102, 241, 0.18) !important;
  color: rgba(99, 102, 241, 0.9) !important;
  transition: all 0.1s ease !important;
}

.prompt-btn:active {
  background: rgba(245, 158, 11, 0.22) !important;
  color: rgba(245, 158, 11, 1) !important;
}

/* ── 编辑按钮 ── */
.edit-btn {
  color: rgba(16, 185, 129, 0.7) !important;
}

.edit-btn:hover {
  background: rgba(16, 185, 129, 0.12) !important;
  color: rgba(16, 185, 129, 1) !important;
}

.edit-btn:active {
  background: rgba(16, 185, 129, 0.22) !important;
  color: rgba(16, 185, 129, 1) !important;
}

.nav-btn svg {
  display: block;
}
</style>
