<script lang="ts">
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoGetStyle,
  PlasmoMountShadowHost
} from "plasmo"

import cssText from "data-text:./doubao-timeline.css"
import KimiTimeline from "../components/kimi/KimiTimeline.vue"

export const config: PlasmoCSConfig = {
  matches: ["https://www.kimi.com/*"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const getInlineAnchor: PlasmoGetInlineAnchor = () => document.documentElement

const mountShadowHost: PlasmoMountShadowHost = ({ anchor, shadowHost }) => {
  const mountPoint = document.body ?? anchor?.element ?? document.documentElement
  mountPoint.appendChild(shadowHost!)
}

export default {
  plasmo: {
    getInlineAnchor,
    mountShadowHost,
    getStyle
  },
  components: {
    KimiTimeline
  }
}
</script>

<template>
  <KimiTimeline />
</template>
