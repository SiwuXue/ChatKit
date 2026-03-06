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
const isReady = ref(false)
const saveError = ref("")
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

const loadSiteSettings = async () => {
  isLoading.value = true
  isHydrating.value = true
  saveError.value = ""

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
}

watch(selectedSiteId, () => {
  if (!isReady.value) {
    return
  }

  void loadSiteSettings()
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
        <h1>文件夹选项</h1>
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

      <div class="footer">
        <button type="button" class="reset-btn" @click="resetCurrentSiteSettings">
          重置当前站点配置
        </button>
      </div>

      <p v-if="saveError" class="error">{{ saveError }}</p>
    </section>
  </main>
</template>

<style scoped>
.popup-root {
  width: 360px;
  min-height: 440px;
  margin: 0;
  padding: 14px;
  box-sizing: border-box;
  background: #edf2f9;
  color: #243046;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
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
  font-size: 28px;
  line-height: 1.1;
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

.rows {
  margin-top: 14px;
}

.rows.disabled {
  opacity: 0.7;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
}

.row + .row {
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
  margin-top: 12px;
  border: 1px solid #d5deeb;
  border-radius: 10px;
  padding: 10px;
  background: #f1f5fc;
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

.footer {
  margin-top: 12px;
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

.error {
  margin: 10px 0 0;
  font-size: 12px;
  color: #b42318;
}
</style>
