<script lang="ts">
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoMountShadowHost,
} from "plasmo"

import {
  imageDataMap,
  videoCache,
  type DoubaoImageData,
} from "~/lib/doubao-download"
import DoubaoDownload from "~/components/DoubaoDownload.vue"

export const config: PlasmoCSConfig = {
  matches: ["https://*.doubao.com/*", "https://doubao.com/*"],
  run_at: "document_start",
}

// ==================== 主世界脚本注入 ====================
// CSP 允许 chrome-extension://<id>/，通过 web_accessible_resource + script src 注入主世界

function injectMainWorldScript(): void {
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL("doubao-download-main.js")
  script.onload = () => script.remove()
  const parent = document.documentElement
  if (parent.firstChild) {
    parent.insertBefore(script, parent.firstChild)
  } else {
    parent.appendChild(script)
  }
}

injectMainWorldScript()

// ==================== 接收主世界数据 ====================

window.addEventListener("message", (ev: MessageEvent) => {
  const data = ev.data
  if (!data || !data.__doubao_ext_dl__) return

  if (data.type === "image-data" && Array.isArray(data.data)) {
    for (const img of data.data as DoubaoImageData[]) {
      if (img.key) imageDataMap.set(img.key, img)
    }
    window.dispatchEvent(new CustomEvent("doubao-download:data-updated"))
  }

  if (data.type === "video-data" && Array.isArray(data.data)) {
    for (const v of data.data as { vid: string; messageId: string }[]) {
      videoCache.set(v.messageId, v.vid)
    }
    window.dispatchEvent(new CustomEvent("doubao-download:data-updated"))
  }
})

// ==================== Shadow DOM 挂载 ====================

const getInlineAnchor: PlasmoGetInlineAnchor = () =>
  document.body ?? document.documentElement

const mountShadowHost: PlasmoMountShadowHost = ({
  shadowHost,
}) => {
  const hostElement = shadowHost as HTMLElement
  hostElement.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 0 !important;
    height: 0 !important;
    z-index: 2147483646 !important;
    pointer-events: none !important;
    overflow: visible !important;
  `

  const tryMount = () => {
    const mountPoint = document.body || document.documentElement
    if (mountPoint && !mountPoint.contains(shadowHost)) {
      mountPoint.appendChild(shadowHost)
    }
  }

  if (document.body) {
    tryMount()
  } else {
    document.addEventListener("DOMContentLoaded", tryMount, { once: true })
  }

  const observer = new MutationObserver(() => {
    if (!document.contains(shadowHost)) {
      tryMount()
    }
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

export default {
  plasmo: {
    getInlineAnchor,
    mountShadowHost,
  },
  components: {
    DoubaoDownload,
  },
}
</script>

<template>
  <DoubaoDownload />
</template>
