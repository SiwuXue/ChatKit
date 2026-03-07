<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"

import {
  detectSupportedSite,
  getDefaultSiteSettings,
  getFolderStorageKey,
  getSiteSettings,
  setSiteSettings,
  storageSyncGet,
  supportedSites,
  type SiteSettings
} from "./lib/site-settings"

type SupportedSiteId = (typeof supportedSites)[number]["id"]

type StarredHistoryItem = {
  id: string
  title: string
  href: string
  folderPath: string
}

const selectedSiteId = ref<SupportedSiteId>("doubao")
const settings = ref<SiteSettings>(getDefaultSiteSettings())

const isLoading = ref(true)
const isHydrating = ref(false)
const isReady = ref(false)
const saveError = ref("")
const actionMessage = ref("")
const activeTabHost = ref("")
const activeSiteLabel = ref("未识别")

const showStarredDialog = ref(false)
const starredLoading = ref(false)
const starredError = ref("")
const starredItems = ref<StarredHistoryItem[]>([])

const selectedSite = computed(
  () => supportedSites.find((site) => site.id === selectedSiteId.value) ?? supportedSites[0]
)

const isFolderOptionsDisabled = computed(() => isLoading.value)
const isTimelineOptionsDisabled = computed(() => isLoading.value || !settings.value.enabled)

const parseHostname = (url?: string) => {
  if (!url) {
    return ""
  }

  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

const queryActiveTabHostname = async () =>
  await new Promise<string>((resolve) => {
    if (typeof chrome === "undefined" || typeof chrome.tabs === "undefined") {
      resolve("")
      return
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const lastError = chrome.runtime?.lastError
      if (lastError) {
        resolve("")
        return
      }

      resolve(parseHostname(tabs[0]?.url))
    })
  })

const showActionMessage = (message: string) => {
  actionMessage.value = message
  setTimeout(() => {
    if (actionMessage.value === message) {
      actionMessage.value = ""
    }
  }, 1800)
}

const loadSiteSettings = async () => {
  isLoading.value = true
  isHydrating.value = true
  saveError.value = ""
  actionMessage.value = ""

  try {
    settings.value = await getSiteSettings(selectedSite.value.hostname)
  } catch (error) {
    console.warn("[popup] load site settings failed", error)
    settings.value = getDefaultSiteSettings()
    saveError.value = "读取配置失败，已回退默认配置"
  } finally {
    isHydrating.value = false
    isLoading.value = false
  }
}

const persistSiteSettings = async () => {
  if (isHydrating.value) {
    return
  }

  saveError.value = ""
  try {
    await setSiteSettings(selectedSite.value.hostname, settings.value)
  } catch (error) {
    console.warn("[popup] save site settings failed", error)
    saveError.value = "保存失败，请重试"
  }
}

const resetCurrentSiteSettings = async () => {
  isHydrating.value = true
  settings.value = getDefaultSiteSettings()
  isHydrating.value = false
  await persistSiteSettings()
  showActionMessage("已重置当前站点全部配置")
}

const resetTimelinePosition = () => {
  const defaults = getDefaultSiteSettings()
  settings.value.timelineTop = defaults.timelineTop
  settings.value.timelineRight = defaults.timelineRight
  showActionMessage("时间线位置已重置")
}

const toAbsoluteConversationUrl = (rawHref: string) => {
  if (/^https?:\/\//i.test(rawHref)) {
    return rawHref
  }

  if (rawHref.startsWith("/")) {
    return `https://${selectedSite.value.hostname}${rawHref}`
  }

  return `https://${selectedSite.value.hostname}/${rawHref}`
}

const collectStarredHistory = (raw: unknown): StarredHistoryItem[] => {
  if (!Array.isArray(raw)) {
    return []
  }

  const result: StarredHistoryItem[] = []

  const visit = (nodes: unknown[], path: string[]) => {
    for (const nodeRaw of nodes) {
      if (!nodeRaw || typeof nodeRaw !== "object") {
        continue
      }

      const node = nodeRaw as {
        id?: unknown
        name?: unknown
        conversations?: unknown
        children?: unknown
      }

      const folderName =
        typeof node.name === "string" && node.name.trim() ? node.name.trim() : "未命名文件夹"
      const nextPath = [...path, folderName]

      if (Array.isArray(node.conversations)) {
        for (const conversationRaw of node.conversations) {
          if (!conversationRaw || typeof conversationRaw !== "object") {
            continue
          }

          const conversation = conversationRaw as {
            id?: unknown
            title?: unknown
            href?: unknown
            starred?: unknown
          }

          if (!conversation.starred) {
            continue
          }

          const id =
            typeof conversation.id === "string" && conversation.id.trim()
              ? conversation.id
              : `star-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
          const title =
            typeof conversation.title === "string" && conversation.title.trim()
              ? conversation.title.trim()
              : "未命名对话"
          const hrefRaw =
            typeof conversation.href === "string" && conversation.href.trim()
              ? conversation.href
              : `/chat/${id}`

          result.push({
            id,
            title,
            href: toAbsoluteConversationUrl(hrefRaw),
            folderPath: nextPath.join(" / ")
          })
        }
      }

      if (Array.isArray(node.children)) {
        visit(node.children, nextPath)
      }
    }
  }

  visit(raw, [])
  return result
}

const loadStarredHistory = async () => {
  starredLoading.value = true
  starredError.value = ""

  try {
    const folderStorageKey = getFolderStorageKey(selectedSite.value.hostname)
    let raw = await storageSyncGet(folderStorageKey)

    if (!Array.isArray(raw) && selectedSite.value.id === "doubao") {
      raw = await storageSyncGet("doubao-folder-tree-v1")
    }

    starredItems.value = collectStarredHistory(raw)
  } catch (error) {
    console.warn("[popup] load starred history failed", error)
    starredItems.value = []
    starredError.value = "读取星标历史失败"
  } finally {
    starredLoading.value = false
  }
}

const openStarredHistory = async () => {
  showStarredDialog.value = true
  await loadStarredHistory()
}

const openConversation = (url: string) => {
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url })
    return
  }

  window.open(url, "_blank")
}

watch(selectedSiteId, () => {
  if (!isReady.value) {
    return
  }

  void loadSiteSettings()
  starredItems.value = []
  starredError.value = ""
})

watch(
  settings,
  () => {
    void persistSiteSettings()
  },
  { deep: true }
)

onMounted(async () => {
  const hostname = await queryActiveTabHostname()
  activeTabHost.value = hostname || "未知页面"

  const matchedSite = detectSupportedSite(hostname)
  if (matchedSite) {
    selectedSiteId.value = matchedSite.id
    activeSiteLabel.value = matchedSite.label
  } else {
    activeSiteLabel.value = "非豆包/Kimi页面"
  }

  await loadSiteSettings()
  isReady.value = true
})
</script>

<template>
  <main class="popup-root">
    <section class="card">
      <header class="card-header">
        <h1>站点配置</h1>
        <p class="meta">
          当前标签：{{ activeSiteLabel }}<span v-if="activeTabHost">（{{ activeTabHost }}）</span>
        </p>
      </header>

      <div class="site-switch">
        <button
          v-for="site in supportedSites"
          :key="site.id"
          type="button"
          class="site-btn"
          :class="{ active: selectedSiteId === site.id }"
          @click="selectedSiteId = site.id">
          {{ site.label }}
        </button>
      </div>

      <section class="settings-section">
        <h2>文件夹选项</h2>
        <div class="rows" :class="{ disabled: isFolderOptionsDisabled }">
          <label class="row">
            <div class="row-text">
              <strong>启用文件夹功能</strong>
            </div>
            <input v-model="settings.enabled" class="switch-input" type="checkbox" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>隐藏已归档对话</strong>
            </div>
            <input
              v-model="settings.hideArchivedConversations"
              class="switch-input"
              type="checkbox"
              :disabled="!settings.enabled" />
            <span class="switch-ui"></span>
          </label>

          <div class="slider-row" :class="{ disabled: !settings.enabled }">
            <div class="slider-title">
              <strong>文件夹间距</strong>
              <span>{{ settings.folderSpacing }}px</span>
            </div>
            <input
              v-model.number="settings.folderSpacing"
              type="range"
              min="0"
              max="16"
              step="1"
              :disabled="!settings.enabled" />
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2>时间线选项</h2>

        <div class="timeline-mode" :class="{ disabled: isTimelineOptionsDisabled }">
          <div class="mode-title">滚动模式</div>
          <div class="mode-switch">
            <button
              type="button"
              class="mode-btn"
              :class="{ active: settings.timelineScrollMode === 'flow' }"
              :disabled="isTimelineOptionsDisabled"
              @click="settings.timelineScrollMode = 'flow'">
              流动
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ active: settings.timelineScrollMode === 'jump' }"
              :disabled="isTimelineOptionsDisabled"
              @click="settings.timelineScrollMode = 'jump'">
              跳跃
            </button>
          </div>
        </div>

        <div class="rows" :class="{ disabled: isTimelineOptionsDisabled }">
          <label class="row">
            <div class="row-text">
              <strong>隐藏外部容器</strong>
            </div>
            <input
              v-model="settings.timelineHideOutsideContainer"
              class="switch-input"
              type="checkbox"
              :disabled="isTimelineOptionsDisabled" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>可拖拽时间线</strong>
            </div>
            <input
              v-model="settings.timelineDraggable"
              class="switch-input"
              type="checkbox"
              :disabled="isTimelineOptionsDisabled" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>防自动跳转</strong>
              <p class="desc">避免在查看过往回答时因年份变化自动跳到底部</p>
            </div>
            <input
              v-model="settings.timelinePreventAutoJump"
              class="switch-input"
              type="checkbox"
              :disabled="isTimelineOptionsDisabled" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>
                启用节点层级
                <span class="mini-tag">实验</span>
              </strong>
              <p class="desc">右键点击时间线节点可设置其层级和折叠子节点</p>
            </div>
            <input
              v-model="settings.timelineEnableNodeHierarchy"
              class="switch-input"
              type="checkbox"
              :disabled="isTimelineOptionsDisabled" />
            <span class="switch-ui"></span>
          </label>
        </div>

        <div class="footer">
          <button
            type="button"
            class="action-btn"
            :disabled="isTimelineOptionsDisabled"
            @click="resetTimelinePosition">
            重置时间线位置
          </button>
          <button type="button" class="action-btn star-btn" @click="openStarredHistory">
            查看星标历史
          </button>
        </div>
      </section>

      <div class="footer reset-footer">
        <button type="button" class="reset-btn" @click="resetCurrentSiteSettings">
          重置当前站点配置
        </button>
      </div>

      <p v-if="actionMessage" class="success">{{ actionMessage }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>
    </section>

    <section v-if="showStarredDialog" class="dialog-mask" @click.self="showStarredDialog = false">
      <div class="dialog">
        <header class="dialog-header">
          <h3>星标历史</h3>
          <button type="button" class="dialog-close" @click="showStarredDialog = false">关闭</button>
        </header>

        <div class="dialog-body">
          <p v-if="starredLoading" class="empty">加载中...</p>
          <p v-else-if="starredError" class="error">{{ starredError }}</p>
          <p v-else-if="starredItems.length === 0" class="empty">当前站点暂无星标对话</p>
          <ul v-else class="starred-list">
            <li v-for="item in starredItems" :key="`${item.folderPath}-${item.id}`" class="starred-item">
              <button type="button" class="starred-link" @click="openConversation(item.href)">
                {{ item.title }}
              </button>
              <div class="folder-path">{{ item.folderPath }}</div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </main>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  width: 390px;
  height: 620px;
  max-height: 620px;
  overflow: hidden !important;
  scrollbar-width: none;
  background: #edf2f9;
}

#__plasmo {
  width: 390px;
  height: 620px;
  overflow: hidden !important;
  scrollbar-width: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
#__plasmo::-webkit-scrollbar {
  display: none;
}
</style>

<style scoped>
.popup-root {
  width: 390px;
  height: 620px;
  display: block;
  overflow-y: auto;
  overflow-x: hidden;
  margin: 0;
  padding: 14px;
  box-sizing: border-box;
  background: #edf2f9;
  color: #243046;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  overscroll-behavior: contain;
}

.card {
  border-radius: 16px;
  border: 1px solid #d6deeb;
  background: #f7f9fd;
  box-shadow: 0 6px 18px rgba(25, 36, 53, 0.08);
  padding: 16px;
}

.card-header h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
  font-weight: 800;
}

.meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: #5a6780;
}

.site-switch {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.site-btn {
  height: 34px;
  border: 1px solid #c9d2e2;
  border-radius: 10px;
  background: #fff;
  color: #3a4a66;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.site-btn.active {
  color: #2148b0;
  border-color: #9fb5ee;
  background: #ebf1ff;
}

.settings-section {
  margin-top: 14px;
  border: 1px solid #d5deeb;
  border-radius: 12px;
  background: #f1f5fc;
  padding: 12px;
}

.settings-section h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  color: #324561;
}

.rows {
  margin-top: 10px;
}

.rows.disabled {
  opacity: 0.65;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
}

.row + .row {
  margin-top: 8px;
}

.row-text {
  flex: 1;
  min-width: 0;
  color: #30415f;
}

.row-text strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.3;
  color: #5f6f89;
}

.mini-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  min-width: 32px;
  padding: 0 6px;
  border-radius: 999px;
  background: #e8edf7;
  color: #617493;
  font-size: 11px;
  font-weight: 700;
}

.switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.switch-ui {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #d7dce6;
  position: relative;
  transition: background-color 0.2s ease;
}

.switch-ui::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.switch-input:checked + .switch-ui {
  background: #42bc5a;
}

.switch-input:checked + .switch-ui::after {
  transform: translateX(18px);
}

.switch-input:disabled + .switch-ui {
  opacity: 0.6;
}

.slider-row {
  margin-top: 10px;
  border: 1px solid #d5deeb;
  border-radius: 10px;
  padding: 10px;
  background: #f7f9fd;
}

.slider-row.disabled {
  opacity: 0.6;
}

.slider-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #30415f;
}

input[type="range"] {
  width: 100%;
}

.timeline-mode {
  margin-top: 10px;
}

.timeline-mode.disabled {
  opacity: 0.65;
}

.mode-title {
  margin-bottom: 8px;
  color: #30415f;
  font-weight: 700;
}

.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mode-btn {
  height: 36px;
  border: 1px solid #cad3e2;
  border-radius: 10px;
  background: #fff;
  color: #51617f;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.mode-btn.active {
  border-color: #40b95b;
  background: #28c05b;
  color: #fff;
}

.mode-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.footer {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.action-btn {
  width: 100%;
  height: 36px;
  border: 1px solid #cad3e2;
  border-radius: 10px;
  background: #ffffff;
  color: #30415f;
  font-weight: 700;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.star-btn {
  color: #2f4f7f;
}

.reset-footer {
  margin-top: 14px;
}

.reset-btn {
  width: 100%;
  height: 34px;
  border: 1px solid #cad3e2;
  border-radius: 10px;
  background: #ffffff;
  color: #30415f;
  font-weight: 700;
  cursor: pointer;
}

.success,
.error {
  margin: 10px 0 0;
  font-size: 12px;
}

.success {
  color: #166534;
}

.error {
  color: #b42318;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: grid;
  place-items: center;
  z-index: 20;
}

.dialog {
  width: 340px;
  max-height: 460px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #d4dce9;
  box-shadow: 0 20px 36px rgba(18, 30, 48, 0.25);
  overflow: hidden;
}

.dialog-header {
  height: 46px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e3e8f1;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  color: #2c3f5d;
}

.dialog-close {
  height: 28px;
  border: 1px solid #d3dbe9;
  border-radius: 8px;
  background: #fff;
  color: #4f607e;
  cursor: pointer;
}

.dialog-body {
  padding: 10px 12px 12px;
  max-height: 400px;
  overflow: auto;
}

.empty {
  margin: 4px 0;
  font-size: 13px;
  color: #6a7891;
}

.starred-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.starred-item + .starred-item {
  margin-top: 8px;
}

.starred-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: #274176;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.folder-path {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7892;
}
</style>
