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
  matches: ["https://*.doubao.com/*"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const getInlineAnchor: PlasmoGetInlineAnchor = () => document.querySelector("#root") || document.documentElement

const mountShadowHost: PlasmoMountShadowHost = ({ anchor, shadowHost }) => {
  const mountPoint = anchor?.element || document.body || document.documentElement
  mountPoint.appendChild(shadowHost!)
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
