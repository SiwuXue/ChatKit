<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  type UserConfig,
  PROMPT_CATEGORIES,
  loadConfig,
  replaceVariables,
} from "./prompt-templates"

const props = defineProps<{
  visible: boolean
  anchorEl: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  openEditor: []
}>()

// ── 面板定位（按钮左侧）──
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function updatePosition() {
  if (!props.anchorEl) return
  const anchorRect = props.anchorEl.getBoundingClientRect()

  const panelWidth = 340
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
  }
})

function onResize() {
  if (props.visible) updatePosition()
}

// ── 展开的分类 ──
const expandedCategories = ref<Set<string>>(new Set())

function toggleCategory(cat: string) {
  if (expandedCategories.value.has(cat)) {
    expandedCategories.value.delete(cat)
  } else {
    expandedCategories.value.add(cat)
  }
  nextTick(() => updatePosition())
}

// ── 用户配置 ──
const config = ref<UserConfig>({
  location: "上海市",
  identity: "大学生",
  budget: "有限",
  interests: "美食、旅行、拍照",
})
onMounted(async () => {
  config.value = await loadConfig()
})

// ── 文本注入 ──
function injectToTextarea(text: string) {
  const finalText = replaceVariables(text, config.value)
  console.log("[PromptPanel] injecting:", finalText.substring(0, 60) + "...")

  let inputEl: HTMLElement | null = document.querySelector("textarea")

  if (!inputEl) {
    inputEl = document.querySelector('[contenteditable="true"]') as HTMLElement | null
  }
  if (!inputEl) {
    inputEl = document.querySelector('input[type="text"]') as HTMLElement | null
  }

  if (!inputEl) {
    console.log("[PromptPanel] 未找到输入框")
    return
  }

  inputEl.focus()

  if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
    const nativeSetter =
      inputEl.tagName === "TEXTAREA"
        ? Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value",
          )!.set!
        : Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )!.set!

    nativeSetter.call(inputEl, finalText)

    inputEl.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }))
    inputEl.dispatchEvent(new Event("change", { bubbles: true }))
    inputEl.dispatchEvent(new Event("keyup", { bubbles: true }))
  } else if ((inputEl as HTMLElement).isContentEditable) {
    inputEl.textContent = finalText
    inputEl.dispatchEvent(new Event("input", { bubbles: true }))
  }

  emit("close")
}

// ── 跳转编辑面板 ──
function openEditor() {
  emit("openEditor")
  emit("close")
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
      class="prompt-panel"
      :style="panelStyle"
    >
      <!-- 顶栏 -->
      <div class="panel-header">
        <span class="panel-title">提示词注入</span>
        <button class="panel-close" type="button" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- 分类 + 提示词 -->
      <div class="panel-body">
        <div
          v-for="cat in PROMPT_CATEGORIES"
          :key="cat.category"
          class="prompt-category"
        >
          <button
            class="category-header"
            type="button"
            @click="toggleCategory(cat.category)"
          >
            <svg
              class="category-arrow"
              :class="{ expanded: expandedCategories.has(cat.category) }"
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>{{ cat.category }}</span>
            <span class="category-count">{{ cat.items.length }}</span>
          </button>

          <div
            v-show="expandedCategories.has(cat.category)"
            class="prompt-items"
          >
            <button
              v-for="item in cat.items"
              :key="item.name"
              class="prompt-item"
              type="button"
              @click="injectToTextarea(item.prompt)"
            >
              {{ item.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- 底栏：跳转编辑面板 -->
      <div class="panel-footer">
        <button
          class="settings-toggle"
          type="button"
          @click="openEditor"
        >
          ⚙️ 编辑提示词
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── 面板容器 ── */
.prompt-panel {
  width: 340px;
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
    0 12px 40px rgba(0, 0, 0, 0.08),
    inset 0 1px 1px rgba(255, 255, 255, 0.8);
}

/* ── 顶栏 ── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.75);
}

.panel-close {
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

.panel-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.65);
}

/* ── 主体 ── */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 8px;
}

/* ── 分类 ── */
.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.55);
  transition: all 0.15s ease;
}

.category-header:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.75);
}

.category-arrow {
  transition: transform 0.2s ease;
  color: rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.category-arrow.expanded {
  transform: rotate(90deg);
}

.category-count {
  margin-left: auto;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.25);
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 6px;
  border-radius: 8px;
}

/* ── 提示词按钮 ── */
.prompt-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 4px 8px 24px;
}

.prompt-item {
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.08);
  color: rgba(99, 102, 241, 0.8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.prompt-item:hover {
  background: rgba(99, 102, 241, 0.18);
  color: rgba(99, 102, 241, 1);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.prompt-item:active {
  transform: scale(0.96);
  transition: all 0.08s ease;
}

/* ── 底栏 ── */
.panel-footer {
  flex-shrink: 0;
  padding: 8px 16px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.settings-toggle {
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.settings-toggle:hover {
  background: rgba(99, 102, 241, 0.1);
  color: rgba(99, 102, 241, 0.8);
}
</style>
