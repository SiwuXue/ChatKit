<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { CustomPrompt, UserConfig } from "./prompt-templates"
import {
  loadConfig,
  loadCustomPrompts,
  saveConfig,
  saveCustomPrompts,
} from "./prompt-templates"

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// ── Tab 切换 ──
type Tab = "prompts" | "config"
const activeTab = ref<Tab>("prompts")

// ── 自定义提示词列表 ──
const prompts = ref<CustomPrompt[]>([])

async function loadPrompts() {
  prompts.value = await loadCustomPrompts()
}

// ── 用户配置 ──
const config = ref<UserConfig>({
  location: "上海市",
  identity: "大学生",
  budget: "有限",
  interests: "美食、旅行、拍照",
})

async function loadUserConfig() {
  config.value = await loadConfig()
}

watch(() => props.visible, async (v) => {
  if (v) {
    activeTab.value = "prompts"
    await Promise.all([loadPrompts(), loadUserConfig()])
    editingIndex.value = -1
    editForm.value = { name: "", prompt: "" }
  }
})

// ── 编辑表单 ──
const editingIndex = ref(-1)
const editForm = ref<CustomPrompt>({ name: "", prompt: "" })

function startAdd() {
  editingIndex.value = -2
  editForm.value = { name: "", prompt: "" }
}

function startEdit(index: number) {
  editingIndex.value = index
  editForm.value = { ...prompts.value[index] }
}

function focusNextTextarea(e: Event) {
  const target = e.target as HTMLElement
  const form = target.closest(".edit-form")
  const textarea = form?.querySelector("textarea") as HTMLTextAreaElement | null
  textarea?.focus()
}

function cancelEdit() {
  editingIndex.value = -1
  editForm.value = { name: "", prompt: "" }
}

async function handleSave() {
  const name = editForm.value.name.trim()
  const prompt = editForm.value.prompt.trim()
  if (!name || !prompt) return

  if (editingIndex.value >= 0) {
    prompts.value[editingIndex.value] = { name, prompt }
  } else {
    prompts.value.push({ name, prompt })
  }

  await saveCustomPrompts(prompts.value)
  editingIndex.value = -1
  editForm.value = { name: "", prompt: "" }
}

async function handleDelete(index: number) {
  prompts.value.splice(index, 1)
  await saveCustomPrompts(prompts.value)
  if (editingIndex.value === index) {
    editingIndex.value = -1
    editForm.value = { name: "", prompt: "" }
  }
}

// ── 用户配置保存 ──
const configSaved = ref(false)
async function handleSaveConfig() {
  await saveConfig(config.value)
  configSaved.value = true
  setTimeout(() => { configSaved.value = false }, 2000)
}

// ── ESC 关闭 ──
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.visible) {
    if (editingIndex.value >= 0 || editingIndex.value === -2) {
      cancelEdit()
    } else {
      emit("close")
    }
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown)
})

// ── 可用变量列表 ──
const AVAILABLE_VARIABLES = [
  { var: "{{CURRENT_LOCATION}}", desc: "当前城市" },
  { var: "{{CURRENT_DATE}}", desc: "当前日期" },
  { var: "{{CURRENT_TIME}}", desc: "当前时间" },
  { var: "{{CURRENT_YEAR}}", desc: "当前年份" },
  { var: "{{CURRENT_MONTH}}", desc: "当前月份" },
  { var: "{{CURRENT_DAY}}", desc: "当前日期(日)" },
  { var: "{{CURRENT_WEEKDAY}}", desc: "当前星期" },
  { var: "{{CURRENT_HOUR}}", desc: "当前小时" },
  { var: "{{TIME_PERIOD}}", desc: "时段(早/中/晚)" },
  { var: "{{USER_IDENTITY}}", desc: "用户身份" },
  { var: "{{USER_BUDGET}}", desc: "用户预算" },
  { var: "{{USER_INTERESTS}}", desc: "用户兴趣" },
]
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩层 -->
    <div
      v-if="visible"
      class="editor-overlay"
      @click="emit('close')"
    />

    <!-- 面板 -->
    <div
      v-if="visible"
      class="editor-panel"
    >
      <!-- 顶栏 -->
      <div class="editor-header">
        <span class="editor-title">编辑提示词</span>
        <button class="editor-close" type="button" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="tab-bar">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'prompts' }"
          type="button"
          @click="activeTab = 'prompts'"
        >
          自定义提示词
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'config' }"
          type="button"
          @click="activeTab = 'config'"
        >
          用户配置
        </button>
      </div>

      <!-- 主体 -->
      <div class="editor-body">
        <!-- ═══ Tab: 自定义提示词 ═══ -->
        <div v-if="activeTab === 'prompts'" class="tab-content">
          <!-- 自定义提示词列表 -->
          <div v-if="prompts.length > 0" class="custom-list">
            <div
              v-for="(item, i) in prompts"
              :key="i"
              class="custom-item"
            >
              <button
                class="custom-item-btn"
                type="button"
                @click="startEdit(i)"
              >
                <span class="custom-item-name">{{ item.name }}</span>
                <span class="custom-item-text">{{ item.prompt.substring(0, 50) }}{{ item.prompt.length > 50 ? '...' : '' }}</span>
              </button>
              <button
                class="custom-item-delete"
                type="button"
                title="删除"
                @click.stop="handleDelete(i)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div v-else class="custom-empty">
            暂无自定义提示词
          </div>

          <!-- 编辑表单 -->
          <div v-if="editingIndex >= 0 || editingIndex === -2" class="edit-form">
            <label class="edit-field">
              <span>名称</span>
              <input
                v-model="editForm.name"
                type="text"
                placeholder="提示词名称（如：周末去哪玩）"
                @keydown.enter="focusNextTextarea"
              />
            </label>
            <label class="edit-field">
              <span>模板</span>
              <textarea
                v-model="editForm.prompt"
                placeholder="提示词内容，支持 {{变量}} 自动替换"
                rows="4"
                @keydown.ctrl.enter="handleSave"
              />
            </label>
            <div class="edit-actions">
              <button class="edit-save" type="button" @click="handleSave">
                {{ editingIndex >= 0 ? '更新' : '添加' }}
              </button>
              <button class="edit-cancel" type="button" @click="cancelEdit">取消</button>
            </div>
          </div>

          <!-- 可用变量参考 -->
          <div class="vars-card">
            <div class="vars-card-title">可用变量</div>
            <div class="vars-grid">
              <div
                v-for="v in AVAILABLE_VARIABLES"
                :key="v.var"
                class="vars-item"
              >
                <code class="vars-var">{{ v.var }}</code>
                <span class="vars-desc">{{ v.desc }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Tab: 用户配置 ═══ -->
        <div v-if="activeTab === 'config'" class="tab-content">
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-card-title">📍 个人信息设置</span>
              <span class="config-card-sub">这些信息将替换提示词中的变量</span>
            </div>
            <div class="config-grid">
              <label class="config-field">
                <span class="config-label">所在城市</span>
                <input
                  v-model="config.location"
                  type="text"
                  placeholder="上海市"
                />
              </label>
              <label class="config-field">
                <span class="config-label">身份</span>
                <input
                  v-model="config.identity"
                  type="text"
                  placeholder="大学生"
                />
              </label>
              <label class="config-field">
                <span class="config-label">预算</span>
                <input
                  v-model="config.budget"
                  type="text"
                  placeholder="有限"
                />
              </label>
              <label class="config-field">
                <span class="config-label">兴趣爱好</span>
                <input
                  v-model="config.interests"
                  type="text"
                  placeholder="美食、旅行、拍照"
                />
              </label>
            </div>
            <div class="config-actions">
              <button class="config-save" type="button" @click="handleSaveConfig">
                {{ configSaved ? '✓ 已保存' : '保存配置' }}
              </button>
              <span v-if="configSaved" class="config-saved-hint">配置已更新，注入时生效</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底栏：新增按钮（仅自定义提示词 Tab） -->
      <div v-if="activeTab === 'prompts'" class="editor-footer">
        <button
          class="add-btn"
          type="button"
          :disabled="editingIndex >= 0 || editingIndex === -2"
          @click="startAdd"
        >
          + 新增提示词
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── 遮罩层 ── */
.editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9998;
}

/* ── 面板容器 ── */
.editor-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  overflow: hidden;

  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.12),
    inset 0 1px 1px rgba(255, 255, 255, 0.8);
}

/* ── 顶栏 ── */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.editor-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.75);
}

.editor-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.35);
  transition: all 0.15s ease;
}

.editor-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.65);
}

/* ── Tab 切换 ── */
.tab-bar {
  display: flex;
  gap: 6px;
  padding: 0 16px 4px;
  flex-shrink: 0;
}

.tab-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(0, 0, 0, 0.4);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.6);
}

.tab-btn.active {
  background: rgba(99, 102, 241, 0.12);
  color: rgba(99, 102, 241, 0.9);
}

/* ── 主体 ── */
.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 8px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 自定义列表 ── */
.custom-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.custom-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  overflow: hidden;
}

.custom-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.custom-item-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.custom-item-btn:hover {
  background: rgba(99, 102, 241, 0.06);
}

.custom-item-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.75);
}

.custom-item-text {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-item-delete {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.custom-item-delete:hover {
  background: rgba(220, 38, 38, 0.1);
  color: rgba(220, 38, 38, 0.6);
}

.custom-empty {
  text-align: center;
  padding: 20px 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.3);
}

/* ── 编辑表单 ── */
.edit-form {
  padding: 12px;
  background: rgba(99, 102, 241, 0.04);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-field span {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  font-weight: 500;
}

.edit-field input,
.edit-field textarea {
  padding: 8px 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.7);
  color: rgba(0, 0, 0, 0.8);
  outline: none;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.15s ease;
}

.edit-field input:focus,
.edit-field textarea:focus {
  border-color: rgba(99, 102, 241, 0.4);
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-save,
.edit-cancel {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-save {
  background: rgba(99, 102, 241, 0.12);
  color: rgba(99, 102, 241, 0.9);
}

.edit-save:hover {
  background: rgba(99, 102, 241, 0.22);
}

.edit-cancel {
  background: transparent;
  color: rgba(0, 0, 0, 0.4);
}

.edit-cancel:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.6);
}

/* ── 可用变量卡片 ── */
.vars-card {
  padding: 12px 14px;
  background: #e3f2fd;
  border-radius: 8px;
}

.vars-card-title {
  font-size: 12px;
  font-weight: 600;
  color: #1976d2;
  margin-bottom: 8px;
}

.vars-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}

.vars-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
  line-height: 1.7;
}

.vars-var {
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 10px;
  color: #1565c0;
  background: rgba(25, 118, 210, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.vars-desc {
  color: #666;
}

/* ── 用户配置卡片 ── */
.config-card {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 10px;
}

.config-card-header {
  margin-bottom: 14px;
}

.config-card-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}

.config-card-sub {
  font-size: 11px;
  color: #999;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  font-weight: 500;
}

.config-field input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #333;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.config-field input:focus {
  border-color: rgba(99, 102, 241, 0.4);
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.config-save {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: #67c23a;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.config-save:hover {
  background: #5daf34;
}

.config-saved-hint {
  font-size: 11px;
  color: #67c23a;
}

/* ── 底栏 ── */
.editor-footer {
  flex-shrink: 0;
  padding: 8px 16px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.add-btn {
  width: 100%;
  padding: 8px;
  border: 1px dashed rgba(99, 102, 241, 0.3);
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.04);
  color: rgba(99, 102, 241, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.1);
  color: rgba(99, 102, 241, 0.9);
}

.add-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
