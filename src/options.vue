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

                    <label v-if="selectedSiteId === 'doubao'" class="row">
                        <div class="row-text">
                            <strong>无水印下载</strong>
                            <p class="desc">在图片和视频右上角显示下载按钮，可下载无水印原文件</p>
                        </div>
                        <input v-model="settings.enableDoubaoDownload" class="switch-input" type="checkbox" />
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

            <section class="card">
                <header class="section-header">
                    <h2>宽屏设置</h2>
                </header>

                <div class="slider-row">
                    <div class="slider-title">
                        <strong>页面宽度</strong>
                        <span>{{ settings.chatWidth === 0 ? '关闭' : '+' + settings.chatWidth + 'px' }}</span>
                    </div>
                    <input v-model.number="settings.chatWidth" type="range" min="0" max="2000" step="50" />
                    <p class="desc" style="margin-top:4px">0 为默认宽度，在原宽基础上增加像素</p>
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
    background: #fafafa;
    color: #171717;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

#__plasmo {
    min-height: 100vh;
}
</style>

<style scoped>
.options-root {
    min-height: 100vh;
    padding: 24px 16px 40px;
    box-sizing: border-box;
}

.container {
    max-width: 600px;
    margin: 0 auto;
}

/* ── page header ── */
.page-header {
    margin-bottom: 20px;
}

.page-header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
}

.page-header p {
    margin: 2px 0 0;
    font-size: 13px;
    color: #737373;
}

/* ── card → flat section ── */
.card {
    border: none;
    border-top: 1px solid #e5e5e5;
    border-radius: 0;
    background: none;
    box-shadow: none;
    padding: 16px 0;
    margin-bottom: 0;
}

.card:first-of-type {
    border-top: none;
    padding-top: 0;
}

/* ── site switcher ── */
.site-switch {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
}

.site-switch .label {
    font-weight: 500;
    color: #737373;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.site-btn {
    height: 30px;
    padding: 0 14px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    background: #fff;
    color: #737373;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.1s ease;
}

.site-btn.active {
    color: #171717;
    border-color: #171717;
    background: #fff;
}

.site-btn:hover:not(.active) {
    background: #f5f5f5;
}

/* ── section header ── */
.section-header {
    margin-bottom: 8px;
}

.section-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #171717;
}

/* ── rows ── */
.rows {
    margin-top: 0;
}

.rows.disabled {
    opacity: 0.45;
    pointer-events: none;
}

.row {
    display: flex;
    align-items: center;
    gap: 12px;
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
}

.desc {
    margin: 2px 0 0;
    font-size: 11px;
    line-height: 1.3;
    color: #999;
}

.mini-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 16px;
    padding: 0 5px;
    border-radius: 4px;
    background: #f0f0f0;
    color: #999;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

/* ── toggle switch (matches popup) ── */
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
    border: none;
    border-top: 1px solid #f0f0f0;
    border-radius: 0;
    background: none;
}

.slider-row.disabled {
    opacity: 0.45;
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
    font-variant-numeric: tabular-nums;
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

input[type="range"]:disabled {
    opacity: 0.35;
    cursor: default;
}

/* ── timeline mode ── */
.timeline-mode {
    margin-top: 0;
    padding: 10px 0;
    border-bottom: 1px solid #f0f0f0;
}

.timeline-mode.disabled {
    opacity: 0.45;
    pointer-events: none;
}

.mode-title {
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #171717;
}

.mode-switch {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    max-width: 240px;
}

.mode-btn {
    height: 32px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    background: #fff;
    color: #737373;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.1s ease;
}

.mode-btn.active {
    border-color: #171717;
    background: #171717;
    color: #fff;
}

.mode-btn:disabled {
    opacity: 0.35;
    cursor: default;
}

/* ── buttons ── */
.button-group {
    margin-top: 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.action-btn {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    background: #fff;
    color: #171717;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.1s ease;
}

.action-btn:hover:not(:disabled) {
    background: #f5f5f5;
}

.action-btn:disabled {
    opacity: 0.35;
    cursor: default;
}

/* ── danger zone ── */
.danger-zone {
    border-color: #fecaca;
    background: none;
}

.danger-zone .section-header h2 {
    color: #b91c1c;
}

.action-btn.danger {
    border-color: #fca5a5;
    color: #b91c1c;
    background: #fff;
}

.action-btn.danger:hover:not(:disabled) {
    background: #fef2f2;
}

/* ── status messages ── */
.success,
.error {
    margin: 8px 0 0;
    font-size: 12px;
    font-weight: 500;
}

.success {
    color: #15803d;
}

.error {
    color: #b91c1c;
}
</style>
