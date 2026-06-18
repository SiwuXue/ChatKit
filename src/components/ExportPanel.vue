<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  type ExportFormat,
  FORMAT_LABELS,
  performExport,
} from "~/lib/export-conversation"

const props = defineProps<{
  visible: boolean
  anchorEl: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
}>()

// ── 状态 ──
const scope = ref<"current" | "all">("all")
const format = ref<ExportFormat>("markdown")
const showOptions = ref(false)
const options = ref({
  includeImages: true,
  preserveMath: true,
  includeMetadata: true,
})
const status = ref<"" | "success" | "error">("")
const statusMessage = ref("")

// ── 面板定位 ──
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function updatePosition() {
  if (!props.anchorEl) return
  const anchorRect = props.anchorEl.getBoundingClientRect()

  const panelWidth = 320
  const panelMaxHeight = window.innerHeight * 0.7
  const top = anchorRect.top + anchorRect.height / 2
  const left = anchorRect.left - panelWidth - 12

  const finalLeft = left < 8 ? 8 : left
  const finalTop = Math.max(8, Math.min(top, window.innerHeight - panelMaxHeight / 2))

  panelStyle.value = {
    position: "fixed",
    left: `${finalLeft}px`,
    top: `${finalTop}px`,
    transform: "translateY(-50%)",
    maxHeight: `${panelMaxHeight}px`,
  }
}

watch(() => props.visible, async (v) => {
  if (v) {
    await nextTick()
    updatePosition()
    status.value = ""
    statusMessage.value = ""
  }
})

function onResize() {
  if (props.visible) updatePosition()
}

// ── 导出执行 ──
function doExport() {
  const result = performExport(format.value, scope.value)
  if (result.success) {
    status.value = "success"
    // 短暂显示成功提示后关闭
    setTimeout(() => emit("close"), 800)
  } else {
    status.value = "error"
    statusMessage.value = result.message || "导出失败"
  }
}

// ── 点击面板外关闭 ──
function onDocumentClick(e: MouseEvent) {
  if (!props.visible) return
  if (panelRef.value && !panelRef.value.contains(e.target as Node)) {
    emit("close")
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick, true)
  window.addEventListener("resize", onResize)
})

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick, true)
  window.removeEventListener("resize", onResize)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="panelRef"
      class="export-panel"
      :style="panelStyle"
    >
      <!-- 顶栏 -->
      <div class="panel-header">
        <span class="panel-title">导出对话</span>
        <button class="panel-close" type="button" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- 范围 -->
      <div class="section">
        <div class="section-label">导出范围</div>
        <div class="radio-group">
          <label class="radio-item" :class="{ active: scope === 'all' }">
            <input v-model="scope" type="radio" value="all" />
            <span>整段会话</span>
          </label>
          <label class="radio-item" :class="{ active: scope === 'current' }">
            <input v-model="scope" type="radio" value="current" />
            <span>当前问答</span>
          </label>
        </div>
      </div>

      <!-- 格式 -->
      <div class="section">
        <div class="section-label">导出格式</div>
        <div class="radio-list">
          <label
            v-for="(label, key) in FORMAT_LABELS"
            :key="key"
            class="radio-item"
            :class="{ active: format === key }"
          >
            <input v-model="format" type="radio" :value="key" />
            <span>{{ label }}</span>
          </label>
        </div>
      </div>

      <!-- 选项（折叠） -->
      <div class="section">
        <button class="options-toggle" type="button" @click="showOptions = !showOptions">
          <span>高级选项</span>
          <svg
            :class="{ rotated: showOptions }"
            width="12" height="12"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div v-if="showOptions" class="options-list">
          <label class="checkbox-item">
            <input v-model="options.includeImages" type="checkbox" />
            <span>包含图片引用</span>
          </label>
          <label class="checkbox-item">
            <input v-model="options.preserveMath" type="checkbox" />
            <span>保留 LaTeX 数学公式</span>
          </label>
          <label class="checkbox-item">
            <input v-model="options.includeMetadata" type="checkbox" />
            <span>包含元数据头</span>
          </label>
        </div>
      </div>

      <!-- 状态提示 -->
      <div v-if="status" class="status-bar" :class="status">
        <template v-if="status === 'success'">已下载</template>
        <template v-else>{{ statusMessage }}</template>
      </div>

      <!-- 下载按钮 -->
      <button class="export-btn" type="button" @click="doExport">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>下载</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.export-panel {
  width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;

  /* 毛玻璃背景 */
  background: rgba(250, 250, 250, 0.88);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(229, 229, 229, 0.7);
  border-radius: 16px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.06),
    inset 0 1px 1px rgba(255, 255, 255, 0.8);
  z-index: 9999;
  user-select: none;
}

/* ── 顶栏 ── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.75);
}

.panel-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(0, 0, 0, 0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.panel-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
}

/* ── 节 ── */
.section {
  margin-bottom: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

/* ── 单选组 ── */
.radio-group {
  display: flex;
  gap: 6px;
}

.radio-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.03);
  cursor: pointer;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.6);
  transition: all 0.15s;
}

.radio-item:hover {
  background: rgba(0, 0, 0, 0.06);
}

.radio-item.active {
  background: rgba(99, 102, 241, 0.1);
  color: rgba(99, 102, 241, 0.85);
}

.radio-item input {
  display: none;
}

.radio-item span {
  white-space: nowrap;
}

/* ── 高级选项 ── */
.options-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.4);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.options-toggle:hover {
  color: rgba(0, 0, 0, 0.6);
}

.options-toggle svg {
  transition: transform 0.2s;
}

.options-toggle svg.rotated {
  transform: rotate(180deg);
}

.options-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
}

.checkbox-item input {
  accent-color: rgba(99, 102, 241, 1);
}

/* ── 状态提示 ── */
.status-bar {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 10px;
}

.status-bar.success {
  background: rgba(52, 211, 153, 0.12);
  color: #059669;
}

.status-bar.error {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

/* ── 导出按钮 ── */
.export-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 0;
  border: none;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.12);
  color: rgba(59, 130, 246, 0.9);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.export-btn:hover {
  background: rgba(59, 130, 246, 0.22);
  color: rgba(59, 130, 246, 1);
}

.export-btn:active {
  transform: scale(0.97);
}

/* ── 滚动条 ── */
.export-panel::-webkit-scrollbar {
  width: 4px;
}

.export-panel::-webkit-scrollbar-track {
  background: transparent;
}

.export-panel::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 2px;
}
</style>
