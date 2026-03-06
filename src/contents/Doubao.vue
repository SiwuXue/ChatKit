<script lang="ts">
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoGetStyle,
  PlasmoMountShadowHost
} from "plasmo"

import cssText from "data-text:./doubao-ui.css"
import FolderManager from "../components/FolderManager.vue"

export const config: PlasmoCSConfig = {
  matches: ["https://www.doubao.com/*"]
}

const getInlineAnchor: PlasmoGetInlineAnchor = () =>
  document.querySelector(".flex-nowrap")

const mountShadowHost: PlasmoMountShadowHost = ({ anchor, shadowHost }) => {
  anchor?.element?.insertBefore(shadowHost!, anchor.element.firstChild)
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export default {
  plasmo: {
    getInlineAnchor,
    mountShadowHost
  },
  components: {
    FolderManager
  },
  methods: {
    suppressInvalidatedContextError(event: ErrorEvent) {
      if (event.message?.includes("Extension context invalidated")) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    suppressInvalidatedContextRejection(event: PromiseRejectionEvent) {
      const reason =
        typeof event.reason === "object" && event.reason
          ? String((event.reason as { message?: unknown }).message ?? "")
          : String(event.reason ?? "")

      if (reason.includes("Extension context invalidated")) {
        event.preventDefault()
      }
    }
  },
  mounted() {
    window.addEventListener("error", this.suppressInvalidatedContextError, true)
    window.addEventListener(
      "unhandledrejection",
      this.suppressInvalidatedContextRejection,
      true
    )
  },
  beforeUnmount() {
    window.removeEventListener("error", this.suppressInvalidatedContextError, true)
    window.removeEventListener(
      "unhandledrejection",
      this.suppressInvalidatedContextRejection,
      true
    )
  }
}
</script>

<template>
  <div class="folder-widget-shell">
    <FolderManager />
  </div>
</template>
