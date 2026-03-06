export type SiteSettings = {
  enabled: boolean
  hideArchivedConversations: boolean
  folderSpacing: number
}

export type SupportedSite = {
  id: "doubao" | "kimi"
  hostname: string
  label: string
}

const defaultSettings: SiteSettings = {
  enabled: true,
  hideArchivedConversations: false,
  folderSpacing: 0
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

export const detectSupportedSite = (
  hostname: string
): SupportedSite | null => {
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

export const normalizeSiteSettings = (raw: unknown): SiteSettings => {
  if (!raw || typeof raw !== "object") {
    return getDefaultSiteSettings()
  }

  const candidate = raw as Partial<SiteSettings>
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : defaultSettings.enabled,
    hideArchivedConversations:
      typeof candidate.hideArchivedConversations === "boolean"
        ? candidate.hideArchivedConversations
        : defaultSettings.hideArchivedConversations,
    folderSpacing: normalizeFolderSpacing(candidate.folderSpacing)
  }
}

export const getSiteSettings = async (
  hostname: string
): Promise<SiteSettings> => {
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
