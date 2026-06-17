<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

import {
  detectSupportedSite,
  getDefaultSiteSettings,
  getFolderStorageKey,
  getSiteSettings,
  getSiteSettingsStorageKey,
  hasStorageSync,
  normalizeSiteSettings,
  storageSyncGet,
  storageSyncSet,
  type SiteSettings
} from "../lib/site-settings"
import FolderTreeItem from "./FolderTreeItem.vue"
import type { FolderConversation, FolderNode } from "./folder-types"

const colorOptions = [
  "#6c7a95",
  "#ef4444",
  "#f59e0b",
  "#16a34a",
  "#0ea5e9",
  "#6366f1",
  "#9333ea",
  "#db2777",
  "#64748b",
  "#111827"
]

const threadItemSelector = [
  'a[data-testid="chat_list_thread_item"]',
  'a[href^="/chat/"]',
  'a[href*="/chat/"]'
].join(",")
const threadTitleSelector = '[data-testid="chat_list_item_title"]'

const folderStorageKey = getFolderStorageKey(location.hostname)
const legacyStorageKey = "doubao-folder-tree-v1"
const settingsStorageKey = getSiteSettingsStorageKey(location.hostname)
const shouldReadLegacyStorage = detectSupportedSite(location.hostname)?.id === "doubao"

const createId = () => `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createFolder = (name: string, color = "#6c7a95"): FolderNode => ({
  id: createId(),
  name,
  color,
  pinned: false,
  expanded: true,
  children: [],
  conversations: []
})

const createDefaultFolders = () => [createFolder("示例文件夹")]

const folders = ref<FolderNode[]>(createDefaultFolders())
const siteSettings = ref<SiteSettings>(getDefaultSiteSettings())

const panelStyle = computed(() => ({
  "--folder-row-gap": `${siteSettings.value.folderSpacing}px`
}))

const rootRef = ref<HTMLElement | null>(null)

const toolbarMenuOpen = ref(false)
const addingRoot = ref(false)
const newRootName = ref("")

const hoveredFolderId = ref<string | null>(null)
const activeMoreMenuId = ref<string | null>(null)
const activeColorPickerId = ref<string | null>(null)

const renameFolderId = ref<string | null>(null)
const renameValue = ref("")

const createChildOfId = ref<string | null>(null)
const childName = ref("")

const dragOverFolderId = ref<string | null>(null)
const draggingConversation = ref<FolderConversation | null>(null)
const draggingFolderId = ref<string | null>(null)
const isHydratingStorage = ref(false)
const transferMessage = ref("")
const transferMessageType = ref<"info" | "success" | "error">("info")
const importFileInputRef = ref<HTMLInputElement | null>(null)

let dragObserver: MutationObserver | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let transferMessageTimer: ReturnType<typeof setTimeout> | null = null

const normalizeConversation = (raw: unknown): FolderConversation | null => {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as Partial<FolderConversation>
  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null
  }

  const title =
    typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : "未命名对话"
  const rawHref =
    typeof candidate.href === "string" && candidate.href.trim()
      ? candidate.href
      : `/chat/${candidate.id}`
  const href = resolveConversationUrl(rawHref, candidate.id)

  return {
    id: candidate.id,
    title,
    href,
    starred: Boolean(candidate.starred)
  }
}

const normalizeFolder = (raw: unknown): FolderNode | null => {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as Partial<FolderNode>
  const name =
    typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : "未命名文件夹"

  const children = Array.isArray(candidate.children)
    ? candidate.children
        .map((item) => normalizeFolder(item))
        .filter((item): item is FolderNode => item !== null)
    : []

  const conversations = Array.isArray(candidate.conversations)
    ? candidate.conversations
        .map((item) => normalizeConversation(item))
        .filter((item): item is FolderConversation => item !== null)
    : []

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : createId(),
    name,
    color:
      typeof candidate.color === "string" && candidate.color.trim()
        ? candidate.color
        : "#6c7a95",
    pinned: Boolean(candidate.pinned),
    expanded: candidate.expanded !== false,
    children,
    conversations
  }
}

const cloneFolderTree = (list: FolderNode[]): FolderNode[] =>
  list.map((folder) => ({
    ...folder,
    conversations: folder.conversations.map((conversation) => ({ ...conversation })),
    children: cloneFolderTree(folder.children)
  }))

const loadFoldersFromStorage = async () => {
  if (!hasStorageSync()) {
    return
  }

  isHydratingStorage.value = true
  try {
    let raw = await storageSyncGet(folderStorageKey)
    let shouldMigrateLegacy = false

    if (!Array.isArray(raw) && shouldReadLegacyStorage) {
      raw = await storageSyncGet(legacyStorageKey)
      shouldMigrateLegacy = Array.isArray(raw)
    }

    if (!Array.isArray(raw)) {
      folders.value = createDefaultFolders()
      return
    }

    const normalized = raw
      .map((item) => normalizeFolder(item))
      .filter((item): item is FolderNode => item !== null)

    if (normalized.length > 0) {
      folders.value = normalized
      if (shouldMigrateLegacy) {
        await storageSyncSet({
          [folderStorageKey]: cloneFolderTree(normalized)
        })
      }
    } else {
      folders.value = createDefaultFolders()
    }
  } catch (error) {
    console.warn("[FolderManager] load sync data failed", error)
    folders.value = createDefaultFolders()
  } finally {
    isHydratingStorage.value = false
  }
}

const loadSiteSettingsFromStorage = async () => {
  try {
    siteSettings.value = await getSiteSettings(location.hostname)
  } catch (error) {
    console.warn("[FolderManager] load site settings failed", error)
    siteSettings.value = getDefaultSiteSettings()
  }
}

const persistFoldersToStorage = async () => {
  if (!hasStorageSync()) {
    return
  }

  try {
    await storageSyncSet({
      [folderStorageKey]: cloneFolderTree(folders.value)
    })
  } catch (error) {
    console.warn("[FolderManager] save sync data failed", error)
  }
}

const schedulePersistFolders = () => {
  if (isHydratingStorage.value || !hasStorageSync()) {
    return
  }

  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(() => {
    void persistFoldersToStorage()
  }, 300)
}

const showTransferMessage = (
  text: string,
  type: "info" | "success" | "error" = "info"
) => {
  transferMessage.value = text
  transferMessageType.value = type

  if (transferMessageTimer) {
    clearTimeout(transferMessageTimer)
  }

  transferMessageTimer = setTimeout(() => {
    transferMessage.value = ""
  }, 2600)
}

const buildFileTimestamp = () => {
  const now = new Date()
  const pad = (num: number) => String(num).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const collectFolderIds = (list: FolderNode[], bucket = new Set<string>()) => {
  for (const folder of list) {
    bucket.add(folder.id)
    collectFolderIds(folder.children, bucket)
  }

  return bucket
}

const ensureUniqueFolderIds = (list: FolderNode[], usedIds: Set<string>) => {
  for (const folder of list) {
    while (usedIds.has(folder.id)) {
      folder.id = createId()
    }

    usedIds.add(folder.id)
    ensureUniqueFolderIds(folder.children, usedIds)
  }
}

const exportFoldersToFile = () => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: cloneFolderTree(folders.value)
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${location.hostname}-folders-${buildFileTimestamp()}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)

  showTransferMessage("导出成功", "success")
}

const triggerImportFolders = () => {
  importFileInputRef.value?.click()
}

const handleImportFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown
    const rawFolders =
      Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { folders?: unknown }).folders)
          ? (parsed as { folders: unknown[] }).folders
          : null

    if (!rawFolders) {
      throw new Error("导入文件格式不正确")
    }

    const normalized = rawFolders
      .map((item) => normalizeFolder(item))
      .filter((item): item is FolderNode => item !== null)

    if (normalized.length === 0) {
      throw new Error("未检测到可导入的文件夹")
    }

    const usedIds = collectFolderIds(folders.value)
    ensureUniqueFolderIds(normalized, usedIds)

    folders.value = [...normalized, ...folders.value]
    showTransferMessage(`导入成功，新增 ${normalized.length} 个文件夹`, "success")
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败"
    showTransferMessage(message, "error")
  } finally {
    target.value = ""
  }
}

type LocatedFolder = {
  node: FolderNode
  siblings: FolderNode[]
  index: number
}

const locateFolder = (list: FolderNode[], id: string): LocatedFolder | null => {
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index]

    if (node.id === id) {
      return { node, siblings: list, index }
    }

    const childResult = locateFolder(node.children, id)
    if (childResult) {
      return childResult
    }
  }

  return null
}

const closeContextMenus = () => {
  toolbarMenuOpen.value = false
  activeMoreMenuId.value = null
  activeColorPickerId.value = null
}

const closeInlineEditors = () => {
  renameFolderId.value = null
  renameValue.value = ""
  createChildOfId.value = null
  childName.value = ""
}

const resolveConversationUrl = (href: string, chatId: string) => {
  try {
    return new URL(href, location.origin).toString()
  } catch {
    return `${location.origin}/chat/${chatId}`
  }
}

const isLikelyThreadAnchor = (anchor: HTMLAnchorElement) => {
  if (anchor.dataset.testid === "chat_list_thread_item") {
    return true
  }

  const href = anchor.getAttribute("href") ?? anchor.href ?? ""
  const maybeChatLink = /\/chat\//.test(href)
  if (!maybeChatLink) {
    return false
  }

  const navigationRoot = anchor.closest(
    "aside,[role='navigation'],nav,[data-empty-conversation]"
  )
  return Boolean(navigationRoot)
}

const parseConversationAnchor = (
  anchor: HTMLAnchorElement
): FolderConversation | null => {
  if (!isLikelyThreadAnchor(anchor)) {
    return null
  }

  const href = anchor.getAttribute("href") ?? anchor.href ?? ""
  const idByDom = anchor.id?.startsWith("conversation_")
    ? anchor.id.slice("conversation_".length)
    : ""
  let idByHref = ""
  try {
    idByHref = /\/chat\/([^/?#]+)/.exec(new URL(href, location.origin).pathname)?.[1] ?? ""
  } catch {
    idByHref = /\/chat\/([^/?#]+)/.exec(href)?.[1] ?? ""
  }
  const chatId = idByDom || idByHref

  const titleElement = anchor.querySelector(threadTitleSelector)
  const title =
    titleElement?.textContent?.trim() ??
    anchor.textContent?.replace(/\s+/g, " ").trim() ??
    ""

  if (!chatId || !title) {
    return null
  }

  return {
    id: chatId,
    title,
    href: resolveConversationUrl(href, chatId),
    starred: false
  }
}

const restoreAllNativeConversationVisibility = () => {
  document
    .querySelectorAll<HTMLAnchorElement>('a[data-folder-archived-hidden="1"]')
    .forEach((anchor) => {
      const previousDisplay = anchor.dataset.folderPreviousDisplay
      if (typeof previousDisplay === "string") {
        anchor.style.display = previousDisplay
      } else {
        anchor.style.removeProperty("display")
      }

      delete anchor.dataset.folderArchivedHidden
      delete anchor.dataset.folderPreviousDisplay
    })
}

const collectArchivedConversationIds = (
  list: FolderNode[],
  bucket = new Set<string>()
) => {
  for (const folder of list) {
    for (const conversation of folder.conversations) {
      bucket.add(conversation.id)
    }

    collectArchivedConversationIds(folder.children, bucket)
  }

  return bucket
}

const applyArchiveVisibilityToPage = () => {
  const shouldHide =
    siteSettings.value.folderEnabled && siteSettings.value.hideArchivedConversations

  if (!shouldHide) {
    restoreAllNativeConversationVisibility()
    return
  }

  const archivedIds = collectArchivedConversationIds(folders.value)
  const anchors = document.querySelectorAll<HTMLAnchorElement>(threadItemSelector)

  anchors.forEach((anchor) => {
    const conversation = parseConversationAnchor(anchor)
    if (!conversation) {
      return
    }

    const shouldHideThis = archivedIds.has(conversation.id)
    const isHidden = anchor.dataset.folderArchivedHidden === "1"

    if (shouldHideThis && !isHidden) {
      anchor.dataset.folderPreviousDisplay = anchor.style.display
      anchor.style.display = "none"
      anchor.dataset.folderArchivedHidden = "1"
      return
    }

    if (!shouldHideThis && isHidden) {
      const previousDisplay = anchor.dataset.folderPreviousDisplay
      if (typeof previousDisplay === "string") {
        anchor.style.display = previousDisplay
      } else {
        anchor.style.removeProperty("display")
      }

      delete anchor.dataset.folderArchivedHidden
      delete anchor.dataset.folderPreviousDisplay
    }
  })
}

const markHistoryItemsDraggable = () => {
  const anchors = document.querySelectorAll<HTMLAnchorElement>(threadItemSelector)
  anchors.forEach((anchor) => {
    if (!isLikelyThreadAnchor(anchor)) {
      return
    }

    if (!siteSettings.value.folderEnabled) {
      anchor.draggable = false
      return
    }

    if (anchor.dataset.folderDragReady === "1") {
      anchor.draggable = true
      return
    }

    anchor.dataset.folderDragReady = "1"
    anchor.draggable = true
  })

  applyArchiveVisibilityToPage()
}

const clearDragSourceTag = () => {
  document
    .querySelectorAll<HTMLElement>(".folder-drag-source")
    .forEach((item) => item.classList.remove("folder-drag-source"))
}

const isTransferFromHistory = (event: DragEvent) => {
  if (draggingConversation.value || draggingFolderId.value) {
    return true
  }

  const transferTypes = event.dataTransfer?.types
  if (!transferTypes) {
    return false
  }

  for (const type of transferTypes) {
    if (
      type === "application/x-doubao-thread" ||
      type === "application/x-folder-node"
    ) {
      return true
    }
  }

  return false
}

const parseConversationFromTransfer = (event: DragEvent) => {
  const payload = event.dataTransfer?.getData("application/x-doubao-thread")

  if (payload) {
    try {
      const parsed = JSON.parse(payload) as Partial<FolderConversation>
      if (parsed.id && parsed.title && parsed.href) {
        return {
          id: parsed.id,
          title: parsed.title,
          href: parsed.href,
          starred: Boolean(parsed.starred)
        }
      }
    } catch {
      return draggingConversation.value
    }
  }

  return draggingConversation.value
}

const parseFolderIdFromTransfer = (event: DragEvent) => {
  const payload = event.dataTransfer?.getData("application/x-folder-node")
  if (payload) {
    try {
      const parsed = JSON.parse(payload) as { id?: unknown }
      if (typeof parsed.id === "string" && parsed.id.trim()) {
        return parsed.id
      }
    } catch {
      return draggingFolderId.value
    }
  }

  return draggingFolderId.value
}

const removeConversationFromFolders = (
  list: FolderNode[],
  conversationId: string
): FolderConversation | null => {
  for (const folder of list) {
    const conversationIndex = folder.conversations.findIndex(
      (item) => item.id === conversationId
    )

    if (conversationIndex >= 0) {
      const [removed] = folder.conversations.splice(conversationIndex, 1)
      return removed
    }

    const removedFromChild = removeConversationFromFolders(
      folder.children,
      conversationId
    )
    if (removedFromChild) {
      return removedFromChild
    }
  }

  return null
}

const addConversationToFolder = (
  folderId: string,
  conversation: FolderConversation
) => {
  const target = locateFolder(folders.value, folderId)
  if (!target) {
    return
  }

  const removed = removeConversationFromFolders(folders.value, conversation.id)
  const nextConversation = removed ?? {
    ...conversation,
    starred: Boolean(conversation.starred)
  }

  if (!target.node.conversations.some((item) => item.id === nextConversation.id)) {
    target.node.conversations.unshift(nextConversation)
  }

  target.node.expanded = true
  applyArchiveVisibilityToPage()
}

const containsFolderId = (list: FolderNode[], targetId: string): boolean => {
  for (const folder of list) {
    if (folder.id === targetId) {
      return true
    }

    if (containsFolderId(folder.children, targetId)) {
      return true
    }
  }

  return false
}

const moveFolderIntoFolder = (sourceId: string, targetId: string) => {
  if (sourceId === targetId) {
    return { moved: false, reason: "same" as const }
  }

  const source = locateFolder(folders.value, sourceId)
  const target = locateFolder(folders.value, targetId)

  if (!source || !target) {
    return { moved: false, reason: "missing" as const }
  }

  if (containsFolderId([source.node], targetId)) {
    return { moved: false, reason: "cycle" as const }
  }

  const [movedNode] = source.siblings.splice(source.index, 1)
  if (!movedNode) {
    return { moved: false, reason: "missing" as const }
  }

  target.node.children.unshift(movedNode)
  target.node.expanded = true
  return { moved: true as const }
}

const toggleConversationStar = ({
  folderId,
  conversationId
}: {
  folderId: string
  conversationId: string
}) => {
  const target = locateFolder(folders.value, folderId)
  if (!target) {
    return
  }

  const conversation = target.node.conversations.find(
    (item) => item.id === conversationId
  )
  if (!conversation) {
    return
  }

  conversation.starred = !conversation.starred
}

const removeConversationFromFolder = ({
  folderId,
  conversationId
}: {
  folderId: string
  conversationId: string
}) => {
  const target = locateFolder(folders.value, folderId)
  if (!target) {
    return
  }

  const index = target.node.conversations.findIndex(
    (item) => item.id === conversationId
  )
  if (index < 0) {
    return
  }

  target.node.conversations.splice(index, 1)
  applyArchiveVisibilityToPage()
}

const handleStorageChanged = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string
) => {
  if (areaName !== "sync") {
    return
  }

  const settingChange = changes[settingsStorageKey]
  if (settingChange) {
    siteSettings.value = normalizeSiteSettings(settingChange.newValue)
    if (!siteSettings.value.folderEnabled) {
      draggingConversation.value = null
      draggingFolderId.value = null
      dragOverFolderId.value = null
      clearDragSourceTag()
      restoreAllNativeConversationVisibility()
    } else {
      applyArchiveVisibilityToPage()
    }

    markHistoryItemsDraggable()
  }

  const folderChange = changes[folderStorageKey]
  if (folderChange && Array.isArray(folderChange.newValue) && !isHydratingStorage.value) {
    const normalized = folderChange.newValue
      .map((item: unknown) => normalizeFolder(item))
      .filter((item: FolderNode | null): item is FolderNode => item !== null)

    if (normalized.length > 0) {
      folders.value = normalized
      applyArchiveVisibilityToPage()
    }
  }
}

const handleGlobalClick = (event: MouseEvent) => {
  if (!rootRef.value) {
    return
  }

  const path = event.composedPath?.() ?? []
  if (path.includes(rootRef.value)) {
    return
  }

  closeContextMenus()
  hoveredFolderId.value = null
}

const handleDocumentDragStart = (event: DragEvent) => {
  if (!siteSettings.value.folderEnabled) {
    return
  }

  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }

  const anchor = target.closest<HTMLAnchorElement>(threadItemSelector)
  if (!anchor || rootRef.value?.contains(anchor)) {
    return
  }

  const conversation = parseConversationAnchor(anchor)
  if (!conversation) {
    return
  }

  draggingConversation.value = conversation

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(
      "application/x-doubao-thread",
      JSON.stringify(conversation)
    )
    event.dataTransfer.setData("text/plain", conversation.title)
  }

  clearDragSourceTag()
  anchor.classList.add("folder-drag-source")
}

const handleDocumentDragEnd = () => {
  draggingConversation.value = null
  draggingFolderId.value = null
  dragOverFolderId.value = null
  clearDragSourceTag()
}

const handleFolderDragStart = (folderId: string) => {
  if (!siteSettings.value.folderEnabled) {
    return
  }

  draggingFolderId.value = folderId
}

const handleFolderDragEnd = () => {
  draggingFolderId.value = null
  dragOverFolderId.value = null
}

const toggleToolbarMenu = () => {
  const nextState = !toolbarMenuOpen.value
  closeContextMenus()
  toolbarMenuOpen.value = nextState
}

const runToolbarAction = (action: "import" | "export") => {
  toolbarMenuOpen.value = false

  if (action === "import") {
    triggerImportFolders()
    return
  }

  exportFoldersToFile()
}

const openAddRoot = () => {
  closeContextMenus()
  closeInlineEditors()
  addingRoot.value = true
  newRootName.value = ""
}

const cancelAddRoot = () => {
  addingRoot.value = false
  newRootName.value = ""
}

const confirmAddRoot = () => {
  const name = newRootName.value.trim()
  if (!name) {
    return
  }

  folders.value.unshift(createFolder(name))
  cancelAddRoot()
}

const toggleExpand = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  if (target.node.children.length === 0 && target.node.conversations.length === 0) {
    return
  }

  target.node.expanded = !target.node.expanded
}

const toggleMoreMenu = (id: string) => {
  toolbarMenuOpen.value = false

  if (activeMoreMenuId.value === id) {
    activeMoreMenuId.value = null
    activeColorPickerId.value = null
    return
  }

  activeMoreMenuId.value = id
  activeColorPickerId.value = null
}

const pinFolder = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  const [item] = target.siblings.splice(target.index, 1)
  item.pinned = true
  target.siblings.unshift(item)

  activeMoreMenuId.value = null
  activeColorPickerId.value = null
}

const startCreateChild = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  closeContextMenus()
  renameFolderId.value = null
  renameValue.value = ""

  target.node.expanded = true
  createChildOfId.value = id
  childName.value = ""
}

const cancelCreateChild = () => {
  createChildOfId.value = null
  childName.value = ""
}

const confirmCreateChild = (parentId: string) => {
  const name = childName.value.trim()
  if (!name) {
    return
  }

  const target = locateFolder(folders.value, parentId)
  if (!target) {
    return
  }

  target.node.children.unshift(createFolder(name, target.node.color))
  target.node.expanded = true

  cancelCreateChild()
}

const startRename = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  closeContextMenus()
  cancelCreateChild()

  renameFolderId.value = id
  renameValue.value = target.node.name
}

const cancelRename = () => {
  renameFolderId.value = null
  renameValue.value = ""
}

const confirmRename = (id: string) => {
  const name = renameValue.value.trim()
  if (!name) {
    return
  }

  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  target.node.name = name
  cancelRename()
}

const toggleColorPicker = (id: string) => {
  activeColorPickerId.value = activeColorPickerId.value === id ? null : id
}

const pickColor = ({ id, color }: { id: string; color: string }) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  target.node.color = color
  activeColorPickerId.value = null
  activeMoreMenuId.value = null
}

const deleteFolder = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  target.siblings.splice(target.index, 1)

  if (renameFolderId.value === id) {
    cancelRename()
  }

  if (createChildOfId.value === id) {
    cancelCreateChild()
  }

  if (activeMoreMenuId.value === id) {
    activeMoreMenuId.value = null
    activeColorPickerId.value = null
  }

  applyArchiveVisibilityToPage()
}

const handleFolderDragOver = ({
  id,
  event
}: {
  id: string
  event: DragEvent
}) => {
  if (!siteSettings.value.folderEnabled || !isTransferFromHistory(event)) {
    return
  }

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move"
  }

  dragOverFolderId.value = id
}

const handleFolderDragLeave = (id: string) => {
  if (dragOverFolderId.value === id) {
    dragOverFolderId.value = null
  }
}

const handleFolderDrop = ({
  id,
  event
}: {
  id: string
  event: DragEvent
}) => {
  if (!siteSettings.value.folderEnabled) {
    return
  }

  event.preventDefault()
  dragOverFolderId.value = null

  const movingFolderId = parseFolderIdFromTransfer(event)
  if (movingFolderId) {
    const result = moveFolderIntoFolder(movingFolderId, id)
    if (!result.moved && result.reason === "cycle") {
      showTransferMessage("不能把文件夹拖到它自己的子文件夹内", "error")
    }

    draggingFolderId.value = null
    return
  }

  const conversation = parseConversationFromTransfer(event)
  if (!conversation) {
    return
  }

  addConversationToFolder(id, conversation)
}

watch(
  folders,
  () => {
    schedulePersistFolders()
    applyArchiveVisibilityToPage()
  },
  { deep: true }
)

watch(
  () => siteSettings.value.hideArchivedConversations,
  () => {
    applyArchiveVisibilityToPage()
  }
)

watch(
  () => siteSettings.value.folderEnabled,
  (enabled) => {
    if (!enabled) {
      draggingConversation.value = null
      draggingFolderId.value = null
      dragOverFolderId.value = null
      clearDragSourceTag()
      restoreAllNativeConversationVisibility()
    }

    markHistoryItemsDraggable()
  }
)

onMounted(() => {
  void loadFoldersFromStorage()
  void loadSiteSettingsFromStorage()

  document.addEventListener("click", handleGlobalClick, true)
  document.addEventListener("dragstart", handleDocumentDragStart, true)
  document.addEventListener("dragend", handleDocumentDragEnd, true)

  markHistoryItemsDraggable()
  dragObserver = new MutationObserver(() => {
    markHistoryItemsDraggable()
  })

  if (document.body) {
    dragObserver.observe(document.body, {
      subtree: true,
      childList: true
    })
  }

  if (hasStorageSync()) {
    chrome.storage.onChanged.addListener(handleStorageChanged)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener("click", handleGlobalClick, true)
  document.removeEventListener("dragstart", handleDocumentDragStart, true)
  document.removeEventListener("dragend", handleDocumentDragEnd, true)
  dragObserver?.disconnect()
  clearDragSourceTag()
  restoreAllNativeConversationVisibility()

  if (hasStorageSync()) {
    chrome.storage.onChanged.removeListener(handleStorageChanged)
  }

  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    void persistFoldersToStorage()
  }

  if (transferMessageTimer) {
    clearTimeout(transferMessageTimer)
    transferMessageTimer = null
  }
})
</script>

<template>
  <section
    v-if="siteSettings.folderEnabled"
    ref="rootRef"
    class="folder-panel"
    :style="panelStyle"
    @click.stop>
    <header class="toolbar">
      <h2 class="title">文件夹</h2>

      <div class="toolbar-actions">
        <div class="menu-host">
          <button class="top-icon-btn" type="button" title="文件夹菜单" @click.stop="toggleToolbarMenu">
            <svg viewBox="0 0 20 16" aria-hidden="true">
              <path
                d="M2.5 4.2a1.5 1.5 0 0 1 1.5-1.5h4L9.2 4h6.8a1.5 1.5 0 0 1 1.5 1.5v7.3a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7" />
            </svg>
          </button>

          <div v-if="toolbarMenuOpen" class="toolbar-menu" @click.stop>
            <button class="toolbar-item" type="button" @click="runToolbarAction('import')">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 11.8V2.5M5.2 5.4L8 2.5l2.8 2.9M3.2 11.8v1.7h9.6v-1.7"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7" />
              </svg>
              <span>导入文件夹</span>
            </button>

            <button class="toolbar-item" type="button" @click="runToolbarAction('export')">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 2.5v9.3M5.2 8.6L8 11.5l2.8-2.9M3.2 11.8v1.7h9.6v-1.7"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7" />
              </svg>
              <span>导出文件夹</span>
            </button>
          </div>
        </div>

        <button class="top-icon-btn" type="button" title="新增文件夹" @click.stop="openAddRoot">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3v10M3 8h10"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8" />
          </svg>
        </button>
      </div>
    </header>

    <p class="drag-hint">拖拽左侧历史对话可归档，拖拽文件夹可放入其他文件夹</p>
    <p
      v-if="transferMessage"
      class="transfer-message"
      :class="`type-${transferMessageType}`">
      {{ transferMessage }}
    </p>

    <div class="folder-list-wrap">
      <div v-if="addingRoot" class="inline-editor root-editor">
        <span class="editor-label">输入文件夹名称:</span>
        <input
          v-model="newRootName"
          class="editor-input"
          placeholder="输入文件夹名称:"
          @keydown.enter.prevent="confirmAddRoot"
          @keydown.esc.prevent="cancelAddRoot" />
        <button class="editor-btn ok" type="button" @click="confirmAddRoot">✓</button>
        <button class="editor-btn cancel" type="button" @click="cancelAddRoot">✗</button>
      </div>

      <ul class="root-list">
        <FolderTreeItem
          v-for="folder in folders"
          :key="folder.id"
          :folder="folder"
          :depth="0"
          :hovered-folder-id="hoveredFolderId"
          :active-more-menu-id="activeMoreMenuId"
          :active-color-picker-id="activeColorPickerId"
          :rename-folder-id="renameFolderId"
          :rename-value="renameValue"
          :create-child-of-id="createChildOfId"
          :child-name="childName"
          :color-options="colorOptions"
          :drag-over-folder-id="dragOverFolderId"
          :dragging-folder-id="draggingFolderId"
          @toggle-expand="toggleExpand"
          @set-hover="hoveredFolderId = $event"
          @toggle-menu="toggleMoreMenu"
          @pin="pinFolder"
          @start-create-child="startCreateChild"
          @start-rename="startRename"
          @toggle-color-picker="toggleColorPicker"
          @pick-color="pickColor"
          @delete="deleteFolder"
          @update:renameValue="renameValue = $event"
          @confirm-rename="confirmRename"
          @cancel-rename="cancelRename"
          @update:childName="childName = $event"
          @confirm-create-child="confirmCreateChild"
          @cancel-create-child="cancelCreateChild"
          @folder-drag-over="handleFolderDragOver"
          @folder-drag-leave="handleFolderDragLeave"
          @folder-drop="handleFolderDrop"
          @folder-drag-start="handleFolderDragStart"
          @folder-drag-end="handleFolderDragEnd"
          @toggle-conversation-star="toggleConversationStar"
          @remove-conversation="removeConversationFromFolder" />
      </ul>
    </div>

    <input
      ref="importFileInputRef"
      class="import-file-input"
      type="file"
      accept=".json,application/json"
      @change="handleImportFileChange" />
  </section>
</template>

<style scoped>
/* 样式已迁移至 doubao-ui.css，此处留空或移除 */
</style>
