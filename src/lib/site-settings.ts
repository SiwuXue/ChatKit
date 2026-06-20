export type SiteSettings = {
  folderEnabled: boolean
  timelineEnabled: boolean
  hideArchivedConversations: boolean
  folderSpacing: number
  timelineScrollMode: "flow" | "jump"
  timelineHideOutsideContainer: boolean
  timelineDraggable: boolean
  timelinePreventAutoJump: boolean
  timelineEnableNodeHierarchy: boolean
  timelineTop: number
  timelineRight: number
  enableDoubaoDownload: boolean
  chatWidth: number
  floatingIconHidden: boolean
  /** 历史会话管理：总开关 */
  historyEnabled: boolean
  /** 单条规则的天数阈值（默认 30） */
  historyOlderThanDays: number
  /** 是否保护星标会话不被规则命中 */
  historyProtectStarred: boolean
  /** 启用每日自动清理（由 background.ts 触发） */
  historyAutoDeleteEnabled: boolean
  /** 上次自动清理时间戳（用于节流） */
  lastHistoryAutoRunAt: number
}

export type SupportedSite = {
  id: "doubao" | "kimi"
  hostname: string
  label: string
}

const defaultSettings: SiteSettings = {
  folderEnabled: true,
  timelineEnabled: true,
  hideArchivedConversations: false,
  folderSpacing: 0,
  timelineScrollMode: "flow",
  timelineHideOutsideContainer: false,
  timelineDraggable: true,
  timelinePreventAutoJump: false,
  timelineEnableNodeHierarchy: false,
  timelineTop: 160,
  timelineRight: 10,
  enableDoubaoDownload: true,
  chatWidth: 0,
  floatingIconHidden: false,
  historyEnabled: false,
  historyOlderThanDays: 30,
  historyProtectStarred: true,
  historyAutoDeleteEnabled: false,
  lastHistoryAutoRunAt: 0
}

export const supportedSites: SupportedSite[] = [
  { id: "doubao", hostname: "doubao.com", label: "豆包" },
  { id: "kimi", hostname: "kimi.com", label: "Kimi" }
]

export const getDefaultSiteSettings = (): SiteSettings => ({
  ...defaultSettings
})

export const hasStorageSync = () =>
  typeof chrome !== "undefined" &&
  typeof chrome.storage !== "undefined" &&
  typeof chrome.storage.sync !== "undefined"

export const storageSyncGet = (key: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    if (!hasStorageSync()) {
      resolve(undefined)
      return
    }

    chrome.storage.sync.get([key], (items) => {
      const lastError = chrome.runtime?.lastError
      if (lastError) {
        reject(new Error(lastError.message))
        return
      }

      resolve(items[key])
    })
  })

export const storageSyncSet = (payload: Record<string, unknown>): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!hasStorageSync()) {
      resolve()
      return
    }

    chrome.storage.sync.set(payload, () => {
      const lastError = chrome.runtime?.lastError
      if (lastError) {
        reject(new Error(lastError.message))
        return
      }

      resolve()
    })
  })

export const detectSupportedSite = (hostname: string): SupportedSite | null => {
  const normalizedHost = hostname.trim().toLowerCase()
  if (!normalizedHost) {
    return null
  }

  return (
    supportedSites.find(
      (site) =>
        normalizedHost === site.hostname ||
        normalizedHost.endsWith(`.${site.hostname}`)
    ) ?? null
  )
}

export const getSiteSettingsStorageKey = (hostname: string) => {
  const site = detectSupportedSite(hostname)
  return site
    ? `site-settings-v1:${site.id}`
    : `site-settings-v1:host:${hostname.trim().toLowerCase()}`
}

export const getFolderStorageKey = (hostname: string) => {
  const site = detectSupportedSite(hostname)
  return site
    ? `folder-tree-v1:${site.id}`
    : `folder-tree-v1:host:${hostname.trim().toLowerCase()}`
}

const normalizeFolderSpacing = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return defaultSettings.folderSpacing
  }

  return Math.max(0, Math.min(16, Math.round(value)))
}

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

const normalizeTimelineScrollMode = (
  value: unknown
): SiteSettings["timelineScrollMode"] => (value === "jump" ? "jump" : "flow")

const normalizeTimelineTop = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return defaultSettings.timelineTop
  }

  return Math.max(0, Math.min(1000, Math.round(value)))
}

const normalizeTimelineRight = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return defaultSettings.timelineRight
  }

  return Math.max(0, Math.min(500, Math.round(value)))
}

export const normalizeSiteSettings = (raw: unknown): SiteSettings => {
  if (!raw || typeof raw !== "object") {
    return getDefaultSiteSettings()
  }

  const candidate = raw as Record<string, unknown> & Partial<SiteSettings>

  // Migration: old "enabled" field → new "folderEnabled" + "timelineEnabled"
  const oldEnabled = (candidate as Record<string, unknown>).enabled
  const hasOldEnabled = typeof oldEnabled === "boolean"
  const hasNewFields =
    typeof candidate.folderEnabled === "boolean" &&
    typeof candidate.timelineEnabled === "boolean"
  const migrationValue = hasOldEnabled && !hasNewFields ? oldEnabled : undefined

  return {
    folderEnabled:
      migrationValue !== undefined
        ? migrationValue
        : normalizeBoolean(candidate.folderEnabled, defaultSettings.folderEnabled),
    timelineEnabled:
      migrationValue !== undefined
        ? migrationValue
        : normalizeBoolean(candidate.timelineEnabled, defaultSettings.timelineEnabled),
    hideArchivedConversations: normalizeBoolean(
      candidate.hideArchivedConversations,
      defaultSettings.hideArchivedConversations
    ),
    folderSpacing: normalizeFolderSpacing(candidate.folderSpacing),
    timelineScrollMode: normalizeTimelineScrollMode(candidate.timelineScrollMode),
    timelineHideOutsideContainer: normalizeBoolean(
      candidate.timelineHideOutsideContainer,
      defaultSettings.timelineHideOutsideContainer
    ),
    timelineDraggable: normalizeBoolean(
      candidate.timelineDraggable,
      defaultSettings.timelineDraggable
    ),
    timelinePreventAutoJump: normalizeBoolean(
      candidate.timelinePreventAutoJump,
      defaultSettings.timelinePreventAutoJump
    ),
    timelineEnableNodeHierarchy: normalizeBoolean(
      candidate.timelineEnableNodeHierarchy,
      defaultSettings.timelineEnableNodeHierarchy
    ),
    timelineTop: normalizeTimelineTop(candidate.timelineTop),
    timelineRight: normalizeTimelineRight(candidate.timelineRight),
    enableDoubaoDownload: normalizeBoolean(
      candidate.enableDoubaoDownload,
      defaultSettings.enableDoubaoDownload
    ),
    chatWidth: typeof candidate.chatWidth === "number" && !Number.isNaN(candidate.chatWidth)
      ? Math.max(0, Math.min(2000, Math.round(candidate.chatWidth)))
      : defaultSettings.chatWidth,
    floatingIconHidden: normalizeBoolean(
      candidate.floatingIconHidden,
      defaultSettings.floatingIconHidden
    ),
    historyEnabled: normalizeBoolean(
      candidate.historyEnabled,
      defaultSettings.historyEnabled
    ),
    historyOlderThanDays:
      typeof candidate.historyOlderThanDays === "number" &&
      !Number.isNaN(candidate.historyOlderThanDays)
        ? Math.max(1, Math.min(3650, Math.round(candidate.historyOlderThanDays)))
        : defaultSettings.historyOlderThanDays,
    historyProtectStarred: normalizeBoolean(
      candidate.historyProtectStarred,
      defaultSettings.historyProtectStarred
    ),
    historyAutoDeleteEnabled: normalizeBoolean(
      candidate.historyAutoDeleteEnabled,
      defaultSettings.historyAutoDeleteEnabled
    ),
    lastHistoryAutoRunAt:
      typeof candidate.lastHistoryAutoRunAt === "number" &&
      !Number.isNaN(candidate.lastHistoryAutoRunAt)
        ? Math.max(0, Math.round(candidate.lastHistoryAutoRunAt))
        : defaultSettings.lastHistoryAutoRunAt
  }
}

export const getSiteSettings = async (hostname: string): Promise<SiteSettings> => {
  const key = getSiteSettingsStorageKey(hostname)
  const raw = await storageSyncGet(key)
  return normalizeSiteSettings(raw)
}

export const setSiteSettings = async (
  hostname: string,
  settings: SiteSettings
): Promise<void> => {
  const key = getSiteSettingsStorageKey(hostname)
  await storageSyncSet({ [key]: normalizeSiteSettings(settings) })
}
