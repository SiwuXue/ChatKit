<script lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import type {
  PlasmoCSConfig,
  PlasmoGetInlineAnchor,
  PlasmoMountShadowHost,
} from "plasmo"

import FloatingButton from "~/components/FloatingButton.vue"
import type { SupportedSiteId } from "~/components/history-types"
import { detectHistorySite } from "~/lib/history-selectors"
import { collectConversations } from "~/lib/extract-conversations"
import { batchDelete, archiveConversation } from "~/lib/conversation-api"
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
    const siteId = ref<SupportedSiteId | null>(
      detectHistorySite(window.location.hostname)
    )
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

    const runAutoClean = async (
      olderThanDays: number,
      protectStarred: boolean
    ) => {
      if (!siteId.value) return
      try {
        const convs = collectConversations(siteId.value)
        const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
        const matched = convs.filter((c) => {
          if (protectStarred && c.starred) return false
          if (c.lastActiveAt === null) return false
          return c.lastActiveAt < cutoff
        })
        const ids = matched.map((c) => c.id)
        if (ids.length === 0) {
          console.log(`[history/autoRun] ${siteId.value}: nothing to clean`)
          return
        }
        const result = await batchDelete(siteId.value, ids)
        console.log(
          `[history/autoRun] ${siteId.value}: success=${result.succeeded.length} failed=${result.failed.length} notImpl=${result.notImplemented}`
        )
        // 本地归档兜底（API 未实现时）
        if (result.notImplemented) {
          for (const id of ids) {
            await archiveConversation(siteId.value, id)
          }
        }
      } catch (e) {
        console.warn(`[history/autoRun] ${siteId.value} failed`, e)
      }
    }

    const handleRuntimeMessage = (
      message: { type?: string; site?: SupportedSiteId; olderThanDays?: number; protectStarred?: boolean },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message?.type === "history/autoRun" && message.site === siteId.value) {
        void runAutoClean(
          message.olderThanDays ?? 30,
          message.protectStarred ?? true
        ).then(() => sendResponse({ ok: true }))
        return true
      }
      return false
    }

    onMounted(async () => {
      await refreshHidden()

      if (typeof chrome !== "undefined") {
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.addListener(handleStorageChange)
        }
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.addListener(handleRuntimeMessage)
        }
      }
    })

    onUnmounted(() => {
      if (typeof chrome !== "undefined") {
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(handleStorageChange)
        }
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
        }
      }
    })

    return { isHidden, siteId }
  },
}
</script>

<template>
  <FloatingButton :hidden="isHidden" :site-id="siteId" />
</template>
