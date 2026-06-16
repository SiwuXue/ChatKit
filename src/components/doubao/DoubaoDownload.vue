<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"

import {
  type DoubaoImageData,
  downloadFile,
  extractFileKey,
  imageDataMap,
  startVideoDownloadByMessageId,
  videoCache,
} from "~/lib/doubao-download"
import {
  getDefaultSiteSettings,
  getSiteSettings,
  type SiteSettings,
} from "~/lib/site-settings"

// ==================== 状态 ====================

const settings = ref<SiteSettings>(getDefaultSiteSettings())
const isEnabled = ref(true)

const injectedElements = new WeakSet<Element>()
const pendingButtons = new Map<
  string,
  HTMLButtonElement
>()

let domObserver: MutationObserver | null = null
let styleElement: HTMLStyleElement | null = null

// ==================== 按钮 SVG ====================

const IMAGE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-4-3 3-4-4-5 5"/></svg>`
const VIDEO_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`

// ==================== 样式注入 ====================

function injectButtonStyles(): void {
  if (document.getElementById("doubao-ext-dl-styles")) return
  const style = document.createElement("style")
  style.id = "doubao-ext-dl-styles"
  style.textContent = `
    .doubao-ext-dl-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 999;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px;
      background: rgba(0,0,0,0.65);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: background 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      line-height: 1;
    }
    .doubao-ext-dl-btn:hover {
      background: rgba(0,0,0,0.85);
    }
    .doubao-ext-dl-btn:active {
      transform: scale(0.97);
    }
    .doubao-ext-dl-btn:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .doubao-ext-dl-btn.dl-success {
      background: rgba(23,23,23,0.9);
    }
    .doubao-ext-dl-btn.dl-error {
      background: rgba(220,38,38,0.85);
    }
    .doubao-ext-dl-container {
      position: relative;
    }
  `
  document.head.appendChild(style)
  styleElement = style
}

function removeButtonStyles(): void {
  if (styleElement?.isConnected) {
    styleElement.remove()
    styleElement = null
  }
}

// ==================== 按钮创建 ====================

function findParentContainer(el: Element): Element {
  let parent = el.parentElement
  for (let i = 0; i < 8 && parent && parent !== document.body; i++) {
    const cn = parent.className?.toString() || ""
    if (
      cn.includes("creation") ||
      cn.includes("image-card") ||
      cn.includes("message-content") ||
      (parent.getBoundingClientRect().width >= 150 &&
        parent.getBoundingClientRect().height >= 150)
    ) {
      break
    }
    parent = parent.parentElement
  }
  return parent || el.parentElement!
}

function createImageButton(
  imageData: DoubaoImageData
): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.className = "doubao-ext-dl-btn"
  btn.innerHTML = IMAGE_ICON + " 原图"
  btn.title = "下载无水印原图"
  btn.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    btn.disabled = true
    btn.innerHTML = "下载中..."
    try {
      await downloadFile(
        imageData.no_watermark_url,
        `doubao_${Date.now()}.png`
      )
      btn.innerHTML = "✓ 完成"
      btn.classList.add("dl-success")
    } catch {
      btn.innerHTML = "重试"
      btn.classList.add("dl-error")
    }
    setTimeout(() => {
      if (btn.isConnected) {
        btn.innerHTML = IMAGE_ICON + " 原图"
        btn.classList.remove("dl-success", "dl-error")
        btn.disabled = false
      }
    }, 2000)
  })
  return btn
}

function createVideoButton(
  messageId: string
): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.className = "doubao-ext-dl-btn"
  btn.innerHTML = VIDEO_ICON + " 视频"
  btn.title = "下载无水印视频"
  btn.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    btn.disabled = true
    btn.innerHTML = "获取中..."
    pendingButtons.set(messageId, btn)
    const result = await startVideoDownloadByMessageId(
      messageId,
      videoCache
    )
    const b = pendingButtons.get(messageId)
    if (!b) return
    if (result.success && result.videoUrl) {
      await downloadFile(
        result.videoUrl,
        `doubao_video_${Date.now()}.mp4`
      )
      b.innerHTML = "✓ 完成"
      b.classList.add("dl-success")
    } else {
      b.innerHTML = "重试"
      b.classList.add("dl-error")
    }
    setTimeout(() => {
      if (b.isConnected) {
        b.innerHTML = VIDEO_ICON + " 视频"
        b.classList.remove("dl-success", "dl-error")
        b.disabled = false
      }
      pendingButtons.delete(messageId)
    }, 2000)
  })
  return btn
}

// ==================== 注入逻辑 ====================

function findMessageId(element: Element): string | null {
  let el: Element | null = element
  for (let i = 0; i < 20 && el && el !== document.body; i++) {
    const htmlEl = el as HTMLElement
    if (htmlEl.dataset?.messageId) return htmlEl.dataset.messageId
    if (htmlEl.dataset?.message_id) return htmlEl.dataset.message_id
    el = el.parentElement
  }
  return null
}

function injectImageButton(
  img: HTMLImageElement,
  imageData: DoubaoImageData
): void {
  if (injectedElements.has(img)) return
  injectedElements.add(img)

  const container = findParentContainer(img)
  if (getComputedStyle(container).position === "static") {
    ;(container as HTMLElement).style.position = "relative"
  }
  container.classList.add("doubao-ext-dl-container")

  if (container.querySelector(".doubao-ext-dl-btn")) return

  const btn = createImageButton(imageData)
  container.appendChild(btn)
}

function injectVideoButton(
  container: Element,
  messageId: string
): void {
  if (injectedElements.has(container) || !messageId) return
  injectedElements.add(container)

  if (getComputedStyle(container).position === "static") {
    ;(container as HTMLElement).style.position = "relative"
  }
  container.classList.add("doubao-ext-dl-container")

  if (container.querySelector(".doubao-ext-dl-btn")) return

  const btn = createVideoButton(messageId)
  container.appendChild(btn)
}

// ==================== 扫描 ====================

function scanAndInject(): void {
  if (!isEnabled.value) return

  // 图片注入
  document
    .querySelectorAll("img[src*='rc_gen_image']")
    .forEach((img) => {
      if (injectedElements.has(img)) return
      const key = extractFileKey(
        (img as HTMLImageElement).src
      )
      if (key && imageDataMap.has(key)) {
        const imageData = imageDataMap.get(key)!
        injectImageButton(img as HTMLImageElement, imageData)
      }
    })

  // 视频注入
  document
    .querySelectorAll(
      '[class*="block-video"], [class*="video-block"], [class*="video-container"]'
    )
    .forEach((el) => {
      if (injectedElements.has(el)) return
      const messageId = findMessageId(el)
      if (messageId && videoCache.has(messageId)) {
        injectVideoButton(el, messageId)
      }
    })
}

// ==================== DOM 观察 ====================

function startDOMObserver(): void {
  if (domObserver) return
  const target = document.body || document.documentElement
  domObserver = new MutationObserver(() => {
    scanAndInject()
  })
  domObserver.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "class"],
  })
}

// ==================== 数据更新事件 ====================

function onDataUpdated(): void {
  scanAndInject()
}

// ==================== 生命周期 ====================

onMounted(async () => {
  // 仅豆包页面生效
  if (!location.hostname.endsWith("doubao.com")) return

  // 加载设置
  try {
    settings.value = await getSiteSettings(location.hostname)
    isEnabled.value = settings.value.enableDoubaoDownload
  } catch {
    isEnabled.value = true
  }

  if (!isEnabled.value) return

  // 注入按钮样式到 host page
  injectButtonStyles()

  // 网络拦截器已在 content script 顶层（document_start）安装
  // 监听数据更新事件
  window.addEventListener(
    "doubao-download:data-updated",
    onDataUpdated
  )

  // 延迟扫描初始数据（等页面渲染完成）
  setTimeout(() => {
    scanAndInject()
  }, 1200)

  // 启动 DOM 观察
  startDOMObserver()
})

onUnmounted(() => {
  // 清理 DOM 观察器
  domObserver?.disconnect()
  domObserver = null

  // 移除事件监听
  window.removeEventListener(
    "doubao-download:data-updated",
    onDataUpdated
  )

  // 移除注入的样式
  removeButtonStyles()

  // 移除注入的按钮
  document
    .querySelectorAll(".doubao-ext-dl-btn")
    .forEach((btn) => btn.remove())
})
</script>

<template>
  <div style="display: none" aria-hidden="true" />
</template>
