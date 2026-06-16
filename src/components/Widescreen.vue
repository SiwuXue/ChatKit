<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"

import {
  getDefaultSiteSettings,
  getSiteSettings,
  type SiteSettings,
} from "~/lib/site-settings"

const settings = ref<SiteSettings>(getDefaultSiteSettings())
const isDoubao = location.hostname.includes("doubao")
let originalWidth = 0
let currentExtra = 0
let _origSetProperty: typeof CSSStyleDeclaration.prototype.setProperty | null = null
let observer: MutationObserver | null = null
let styleEl: HTMLStyleElement | null = null

// ── 读取原始宽度 ──
function captureOriginal(): number {
  if (isDoubao) {
    const el = document.querySelector('[style*="--center-content-max-width"]')
    if (el) {
      const v = (el as HTMLElement).style.getPropertyValue("--center-content-max-width")
      const n = parseInt(v)
      if (n > 0) return n
    }
    // 默认值，Doubao 通常是 800-900px
    return 900
  }
  // Kimi: 获取内容容器的 computed max-width
  const el = document.querySelector(".chat-detail-content, .chat-content-list, main")
  if (el) {
    const mw = getComputedStyle(el).maxWidth
    const n = parseInt(mw)
    if (n > 0) return n
  }
  return 960
}

// ── Doubao: 修改 CSS 变量 ──
function overrideDoubaoVars(extra: number): void {
  document
    .querySelectorAll('[style*="--center-content-max-width"], [style*="--content-max-width"]')
    .forEach((el) => {
      const s = (el as HTMLElement).style
      if (extra > 0 && originalWidth > 0) {
        const v = `${originalWidth + extra}px`
        s.setProperty("--center-content-max-width", v, "important")
        s.setProperty("--content-max-width", v, "important")
      } else {
        s.removeProperty("--center-content-max-width")
        s.removeProperty("--content-max-width")
      }
    })
}

// ── 拦截 setProperty（Doubao）──
function installSetPropertyPatch(): void {
  if (_origSetProperty) return
  _origSetProperty = CSSStyleDeclaration.prototype.setProperty
  CSSStyleDeclaration.prototype.setProperty = function (
    name: string,
    value: string,
    priority?: string
  ) {
    if ((name === "--center-content-max-width" || name === "--content-max-width") && currentExtra > 0) {
      value = `${originalWidth + currentExtra}px`
      priority = "important"
    }
    return _origSetProperty!.call(this, name, value, priority)
  }
}

// ── Kimi: CSS 注入 ──
function updateKimi(extra: number): void {
  if (styleEl) { styleEl.remove(); styleEl = null }
  if (extra <= 0 || originalWidth <= 0) return

  const target = originalWidth + extra
  styleEl = document.createElement("style")
  styleEl.id = "doubao-ext-widescreen"
  styleEl.textContent = `
    .chat-detail-content,
    .chat-content-list,
    main {
      max-width: ${target}px !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
  `
  document.head.appendChild(styleEl)
}

// ── 应用 ──
function apply(extra: number): void {
  currentExtra = extra
  if (isDoubao) {
    overrideDoubaoVars(extra)
    if (extra > 0) {
      installSetPropertyPatch()
    } else if (_origSetProperty) {
      CSSStyleDeclaration.prototype.setProperty = _origSetProperty
      _origSetProperty = null
    }
  } else {
    updateKimi(extra)
  }

  if (!observer && document.body) {
    observer = new MutationObserver(() => {
      if (isDoubao) overrideDoubaoVars(extra)
    })
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["style"],
    })
  }
}

onMounted(async () => {
  if (!location.hostname.includes("doubao") && !location.hostname.includes("kimi")) return

  try {
    settings.value = await getSiteSettings(location.hostname)
  } catch {
    settings.value = getDefaultSiteSettings()
  }

  // 延迟读取，等页面渲染完成
  setTimeout(() => {
    originalWidth = captureOriginal()
    apply(settings.value.chatWidth)
  }, 1500)

  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== "sync") return
    const siteId = isDoubao ? "doubao" : "kimi"
    const key = `site-settings-v1:${siteId}`
    if (changes[key]?.newValue) {
      const raw = changes[key].newValue as SiteSettings
      if (raw.chatWidth !== undefined) {
        settings.value.chatWidth = raw.chatWidth
        if (originalWidth <= 0) originalWidth = captureOriginal()
        apply(raw.chatWidth)
      }
    }
  })
})

onUnmounted(() => {
  if (_origSetProperty) {
    CSSStyleDeclaration.prototype.setProperty = _origSetProperty
  }
  styleEl?.remove()
  observer?.disconnect()
})
</script>

<template>
  <div style="display: none" aria-hidden="true" />
</template>
