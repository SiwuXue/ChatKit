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
    }
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
              <strong>启用文件夹功能</strong>
            </div>
            <input v-model="settings.enabled" class="switch-input" type="checkbox" />
            <span class="switch-ui"></span>
          </label>

          <label class="row">
            <div class="row-text">
              <strong>隐藏已归档对话</strong>
            </div>
            <input v-model="settings.hideArchivedConversations" class="switch-input" type="checkbox"
              :disabled="!settings.enabled" />
            <span class="switch-ui"></span>
          </label>
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
  background: #edf2f9;
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
  height: 300px;
  display: block;
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
  font-size: 22px;
  line-height: 1.15;
  font-weight: 800;
}

.meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: #5a6780;
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
  font-size: 18px;
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

.row+.row {
  margin-top: 8px;
}

.row-text {
  flex: 1;
  min-width: 0;
  color: #30415f;
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

.switch-input:checked+.switch-ui {
  background: #42bc5a;
}

.switch-input:checked+.switch-ui::after {
  transform: translateX(18px);
}

.switch-input:disabled+.switch-ui {
  opacity: 0.6;
}

.footer {
  margin-top: 14px;
}

.action-btn {
  width: 100%;
  height: 38px;
  border: 1px solid #cad3e2;
  border-radius: 10px;
  background: #ffffff;
  color: #30415f;
  font-weight: 700;
  cursor: pointer;
  font-size: 14px;
}

.action-btn.primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #fff;
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
</style>
