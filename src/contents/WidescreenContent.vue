<script lang="ts">
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoMountShadowHost,
} from "plasmo"

import Widescreen from "~/components/Widescreen.vue"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.doubao.com/chat/*",
    "https://www.kimi.com/*",
  ],
}

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
    z-index: 2147483645 !important;
    pointer-events: none !important;
    overflow: visible !important;
  `
  const mountPoint = document.body || document.documentElement
  if (mountPoint && !mountPoint.contains(shadowHost)) {
    mountPoint.appendChild(shadowHost)
  }
}

export default {
  plasmo: {
    getInlineAnchor,
    mountShadowHost,
  },
  components: {
    Widescreen,
  },
}
</script>

<template>
  <Widescreen />
</template>
