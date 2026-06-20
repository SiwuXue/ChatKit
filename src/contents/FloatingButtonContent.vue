<script lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoMountShadowHost,
} from "plasmo"

import FloatingButton from "~/components/FloatingButton.vue"
import { getSiteSettings, getSiteSettingsStorageKey } from "~/lib/site-settings"

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
  setup() {
    const isHidden = ref(false)
    const siteSettingsKey = getSiteSettingsStorageKey(window.location.hostname)

    const refreshHidden = async () => {
      try {
        const settings = await getSiteSettings(window.location.hostname)
        isHidden.value = !!settings.floatingIconHidden
      } catch (e) {
        console.warn("[FloatingButtonContent] failed to load settings", e)
      }
    }

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName
    ) => {
      if (area !== "sync" || !changes[siteSettingsKey]) return
      void refreshHidden()
    }

    onMounted(async () => {
      await refreshHidden()

      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange)
      }
    })

    onUnmounted(() => {
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange)
      }
    })

    return { isHidden }
  },
}
</script>

<template>
  <FloatingButton :hidden="isHidden" />
</template>
