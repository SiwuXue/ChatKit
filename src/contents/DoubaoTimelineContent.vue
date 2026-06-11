<script lang="ts">
import type {
  PlasmoCSConfig,
  PlasmoGetStyle,
  PlasmoGetInlineAnchor,
  PlasmoMountShadowHost
} from "plasmo"

import cssText from "data-text:./doubao-timeline.css"
import DoubaoTimeline from "../components/DoubaoTimeline.vue"

export const config: PlasmoCSConfig = {
  matches: ["https://doubao.com/*", "https://*.doubao.com/*"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const getInlineAnchor: PlasmoGetInlineAnchor = () =>
  document.body ?? document.documentElement

const mountShadowHost: PlasmoMountShadowHost = ({ anchor, shadowHost }) => {
  // 强化 ShadowHost 自身的定位，确保它是一个独立的、最顶层的层级
  const hostElement = shadowHost as HTMLElement
  hostElement.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    width: 0 !important;
    height: 0 !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    overflow: visible !important;
  `

  const doMount = () => {
    const mountPoint = document.body || document.documentElement
    if (mountPoint && !mountPoint.contains(shadowHost)) {
      mountPoint.appendChild(shadowHost)
    }
  }

  doMount()

  // 豆包是单页应用，可能会动态清理 body，增加一个简单的重挂载检查
  const observer = new MutationObserver(() => {
    if (!document.contains(shadowHost)) {
      doMount()
    }
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
}

export default {
  plasmo: {
    getInlineAnchor,
    mountShadowHost,
    getStyle
  },
  components: {
    DoubaoTimeline
  }
}
</script>

<template>
  <DoubaoTimeline />
</template>
