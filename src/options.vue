<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"

import {
    getDefaultSiteSettings,
    getFolderStorageKey,
    getSiteSettings,
    setSiteSettings,
    storageSyncGet,
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

const selectedSite = computed(
    () => supportedSites.find((site) => site.id === selectedSiteId.value) ?? supportedSites[0]
)

const isFolderOptionsDisabled = computed(() => isLoading.value)
const isTimelineOptionsDisabled = computed(() => isLoading.value || !settings.value.enabled)

const showActionMessage = (message: string) => {
    actionMessage.value = message
    setTimeout(() => {
        if (actionMessage.value === message) {
            actionMessage.value = ""
        }
    }, 2500)
}

const loadSiteSettings = async () => {
    isLoading.value = true
    isHydrating.value = true
    saveError.value = ""
    actionMessage.value = ""

    try {
        settings.value = await getSiteSettings(selectedSite.value.hostname)
    } catch (error) {
        console.warn("[options] load site settings failed", error)
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
        console.warn("[options] save site settings failed", error)
        saveError.value = "保存失败，请重试"
    }
}

const resetCurrentSiteSettings = async () => {
    isHydrating.value = true
    settings.value = getDefaultSiteSettings()
    isHydrating.value = false
    await persistSiteSettings()
    showActionMessage("已重置当前站点配置")
}

const resetTimelinePosition = () => {
    const defaults = getDefaultSiteSettings()
    settings.value.timelineTop = defaults.timelineTop
    settings.value.timelineRight = defaults.timelineRight
    showActionMessage("时间线位置已重置")
}

watch(selectedSiteId, () => {
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
    await loadSiteSettings()
})
</script>

<template>
    <main class="options-root">
        <div class="container">
            <header class="page-header">
                <h1>高级设置</h1>
                <p>配置扩展的详细选项</p>
            </header>

            <section class="card">
                <div class="site-switch">
                    <span class="label">选择站点：</span>
                    <button v-for="site in supportedSites" :key="site.id" type="button" class="site-btn"
                        :class="{ active: selectedSiteId === site.id }" @click="selectedSiteId = site.id">
                        {{ site.label }}
                    </button>
                </div>
            </section>

            <section class="card">
                <header class="section-header">
                    <h2>文件夹选项</h2>
                </header>

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
                        <input v-model="settings.hideArchivedConversations" class="switch-input" type="checkbox"
                            :disabled="!settings.enabled" />
                        <span class="switch-ui"></span>
                    </label>

                    <div class="slider-row" :class="{ disabled: !settings.enabled }">
                        <div class="slider-title">
                            <strong>文件夹间距</strong>
                            <span>{{ settings.folderSpacing }}px</span>
                        </div>
                        <input v-model.number="settings.folderSpacing" type="range" min="0" max="16" step="1"
                            :disabled="!settings.enabled" />
                    </div>
                </div>
            </section>

            <section class="card">
                <header class="section-header">
                    <h2>时间线选项</h2>
                </header>

                <div class="timeline-mode" :class="{ disabled: isTimelineOptionsDisabled }">
                    <div class="mode-title">滚动模式</div>
                    <div class="mode-switch">
                        <button type="button" class="mode-btn"
                            :class="{ active: settings.timelineScrollMode === 'flow' }"
                            :disabled="isTimelineOptionsDisabled" @click="settings.timelineScrollMode = 'flow'">
                            流动
                        </button>
                        <button type="button" class="mode-btn"
                            :class="{ active: settings.timelineScrollMode === 'jump' }"
                            :disabled="isTimelineOptionsDisabled" @click="settings.timelineScrollMode = 'jump'">
                            跳跃
                        </button>
                    </div>
                </div>

                <div class="rows" :class="{ disabled: isTimelineOptionsDisabled }">
                    <label class="row">
                        <div class="row-text">
                            <strong>隐藏外部容器</strong>
                        </div>
                        <input v-model="settings.timelineHideOutsideContainer" class="switch-input" type="checkbox"
                            :disabled="isTimelineOptionsDisabled" />
                        <span class="switch-ui"></span>
                    </label>

                    <label class="row">
                        <div class="row-text">
                            <strong>可拖拽时间线</strong>
                        </div>
                        <input v-model="settings.timelineDraggable" class="switch-input" type="checkbox"
                            :disabled="isTimelineOptionsDisabled" />
                        <span class="switch-ui"></span>
                    </label>

                    <label class="row">
                        <div class="row-text">
                            <strong>防自动跳转</strong>
                            <p class="desc">避免在查看过往回答时因年份变化自动跳到底部</p>
                        </div>
                        <input v-model="settings.timelinePreventAutoJump" class="switch-input" type="checkbox"
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
                        <input v-model="settings.timelineEnableNodeHierarchy" class="switch-input" type="checkbox"
                            :disabled="isTimelineOptionsDisabled" />
                        <span class="switch-ui"></span>
                    </label>
                </div>

                <div class="button-group">
                    <button type="button" class="action-btn" :disabled="isTimelineOptionsDisabled"
                        @click="resetTimelinePosition">
                        重置时间线位置
                    </button>
                </div>
            </section>

            <section class="card danger-zone">
                <header class="section-header">
                    <h2>危险区</h2>
                </header>
                <div class="button-group">
                    <button type="button" class="action-btn danger" @click="resetCurrentSiteSettings">
                        重置当前站点所有配置
                    </button>
                </div>
            </section>

            <p v-if="actionMessage" class="success">{{ actionMessage }}</p>
            <p v-if="saveError" class="error">{{ saveError }}</p>
        </div>
    </main>
</template>

<style>
html,
body {
    margin: 0;
    padding: 0;
    background: #edf2f9;
    color: #243046;
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
}

#__plasmo {
    min-height: 100vh;
}
</style>

<style scoped>
.options-root {
    min-height: 100vh;
    padding: 28px 16px;
    box-sizing: border-box;
}

.container {
    max-width: 640px;
    margin: 0 auto;
}

.page-header {
    margin-bottom: 18px;
}

.page-header h1 {
    margin: 0 0 6px;
    font-size: 28px;
    line-height: 1.15;
    font-weight: 800;
}

.page-header p {
    margin: 0;
    font-size: 14px;
    color: #5a6780;
}

.card {
    border-radius: 16px;
    border: 1px solid #d6deeb;
    background: #f7f9fd;
    box-shadow: 0 6px 18px rgba(25, 36, 53, 0.08);
    padding: 18px;
    margin-bottom: 14px;
}

.site-switch {
    display: flex;
    align-items: center;
    gap: 12px;
}

.site-switch .label {
    font-weight: 700;
    color: #324561;
    font-size: 14px;
}

.site-btn {
    height: 34px;
    padding: 0 18px;
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

.section-header {
    margin-bottom: 10px;
}

.section-header h2 {
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
    pointer-events: none;
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

.switch-input:checked+.switch-ui {
    background: #42bc5a;
}

.switch-input:checked+.switch-ui::after {
    transform: translateX(18px);
}

.switch-input:disabled+.switch-ui {
    opacity: 0.6;
}

.slider-row {
    margin-top: 10px;
    border: 1px solid #d5deeb;
    border-radius: 10px;
    padding: 12px;
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
    font-weight: 600;
}

input[type="range"] {
    width: 100%;
}

.timeline-mode {
    margin-top: 10px;
}

.timeline-mode.disabled {
    opacity: 0.65;
    pointer-events: none;
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
    max-width: 260px;
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

.button-group {
    margin-top: 14px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.action-btn {
    height: 36px;
    padding: 0 16px;
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

.danger-zone {
    border-color: #fecaca;
    background: #fef2f2;
}

.action-btn.danger {
    border-color: #fca5a5;
    color: #991b1b;
    background: #fee2e2;
}

.success,
.error {
    margin: 10px 0 0;
    font-size: 14px;
    font-weight: 600;
}

.success {
    color: #166534;
}

.error {
    color: #b42318;
}
</style>
