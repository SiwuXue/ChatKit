<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"

import {
  detectSupportedSite,
  getDefaultSiteSettings,
  getSiteSettings,
  setSiteSettings,
  supportedSites,
  type SiteSettings
} from "./lib/site-settings"

type SupportedSiteId = (typeof supportedSites)[number]["id"]

const selectedSiteId = ref<SupportedSiteId>("doubao")
const settings = ref<SiteSettings>(getDefaultSiteSettings())

const isLoading = ref(true)
const isHydrating = ref(false)
const saveError = ref("")
const actionMessage = ref("")
const activeTabHost = ref("")
const activeSiteLabel = ref("未识别")

const selectedSite = computed(
  () => supportedSites.find((site) => site.id === selectedSiteId.value) ?? supportedSites[0]
)

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

const openOptionsPage = () => {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage()
  } else if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    const url = chrome.runtime.getURL("options.html")
    chrome.tabs.create({ url })
  } else {
    window.open("options.html", "_blank")
  }
}

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
})
</script>

<template>
  <main class="popup-root">
    <section class="card">
      <header class="card-header">
        <h1>快速设置</h1>
        <p class="meta">
          当前标签：{{ activeSiteLabel }}<span v-if="activeTabHost">（{{ activeTabHost }}）</span>
        </p>
      </header>

      <section class="settings-section">
        <h2>核心功能</h2>
        <div class="rows" :class="{ disabled: isLoading }">
          <label class="row">
            <div class="row-text">
              <strong>文件夹</strong>
            </div>
            <input v-model="settings.folderEnabled" class="switch-input" type="checkbox" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>时间线</strong>
            </div>
            <input v-model="settings.timelineEnabled" class="switch-input" type="checkbox" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>隐藏已归档对话</strong>
            </div>
            <input v-model="settings.hideArchivedConversations" class="switch-input" type="checkbox"
              :disabled="!settings.folderEnabled" />
            <span class="switch-ui"></span>
          </label>

          <label v-if="selectedSiteId === 'doubao'" class="row">
            <div class="row-text">
              <strong>无水印下载</strong>
            </div>
            <input v-model="settings.enableDoubaoDownload" class="switch-input" type="checkbox" />
            <span class="switch-ui"></span>
          </label>

          <div class="slider-row">
            <div class="slider-title">
              <strong>宽屏设置</strong>
              <span>{{ settings.chatWidth === 0 ? '关闭' : '+' + settings.chatWidth + 'px' }}</span>
            </div>
            <input v-model.number="settings.chatWidth" type="range" min="0" max="2000" step="50" />
          </div>
        </div>
      </section>

      <div class="footer">
        <button type="button" class="action-btn primary" @click="openOptionsPage">
          打开高级设置
        </button>
      </div>

      <p v-if="actionMessage" class="success">{{ actionMessage }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>
    </section>
  </main>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  width: 320px;
  height: 340px;
  overflow: hidden !important;
  scrollbar-width: none;
  background: #fafafa;
}

#__plasmo {
  width: 320px;
  height: 340px;
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
  width: 320px;
  height: 340px;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 16px;
  box-sizing: border-box;
  background: #fafafa;
  color: #171717;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  overscroll-behavior: contain;
}

/* ── card → flat surface ── */
.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid #e5e5e5;
  background: #fff;
  padding: 16px;
}

/* ── header ── */
.card-header {
  margin-bottom: 4px;
}

.card-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.meta {
  margin: 3px 0 0;
  font-size: 11px;
  color: #737373;
}

/* ── settings group ── */
.settings-section {
  margin-top: 12px;
  padding: 0;
  border: none;
  border-top: 1px solid #e5e5e5;
  border-radius: 0;
  background: none;
}

.settings-section h2 {
  display: none; /* label implied by row text; saves space */
}

.rows {
  margin-top: 0;
  padding-top: 4px;
}

.rows.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0;
  cursor: pointer;
}

.row + .row {
  border-top: 1px solid #f0f0f0;
}

.row-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #171717;
}

.row-text strong {
  font-weight: 500;
}

/* ── toggle switch ── */
.switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.switch-ui {
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: #d4d4d4;
  position: relative;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.switch-ui::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s ease;
}

.switch-input:checked + .switch-ui {
  background: #171717;
}

.switch-input:checked + .switch-ui::after {
  transform: translateX(16px);
}

.switch-input:disabled + .switch-ui {
  opacity: 0.35;
}

/* ── slider ── */
.slider-row {
  margin-top: 0;
  padding: 10px 0;
  border-top: 1px solid #f0f0f0;
}

.slider-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #171717;
}

.slider-title span {
  font-size: 12px;
  color: #737373;
}

input[type="range"] {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e5e5e5;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #171717;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

/* ── footer / button ── */
.footer {
  margin-top: auto;
  padding-top: 12px;
}

.action-btn {
  width: 100%;
  height: 36px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  background: #fff;
  color: #171717;
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.action-btn:hover {
  background: #f5f5f5;
}

.action-btn.primary {
  background: #171717;
  border-color: #171717;
  color: #fff;
}

.action-btn.primary:hover {
  background: #333;
}

/* ── status messages ── */
.success,
.error {
  margin: 8px 0 0;
  font-size: 11px;
  font-weight: 500;
}

.success {
  color: #15803d;
}

.error {
  color: #b91c1c;
}
</style>
