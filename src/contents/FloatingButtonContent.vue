<script lang="ts">
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoMountShadowHost,
} from "plasmo"

import FloatingButton from "~/components/FloatingButton.vue"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.doubao.com/*",
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
    z-index: 2147483646 !important;
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
  },
  components: {
    FloatingButton,
  },
}
</script>

<template>
  <FloatingButton />
</template>
