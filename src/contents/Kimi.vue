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
  matches: ["https://www.kimi.com/*"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const getInlineAnchor: PlasmoGetInlineAnchor = () =>
  document.querySelector(".kimi-plus-part")

const mountShadowHost: PlasmoMountShadowHost = ({ anchor, shadowHost }) => {
  anchor?.element?.insertAdjacentElement("afterend", shadowHost!)
}

export default {
  plasmo: {
    getInlineAnchor,
    mountShadowHost,
    getStyle
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
