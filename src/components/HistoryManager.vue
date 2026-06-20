<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type {
  HistoryConversation,
  HistoryRule,
  SupportedSiteId,
} from "~/components/history-types"
import {
  collectConversations,
  createConversationObserver,
} from "~/lib/extract-conversations"
import { batchDelete, ApiNotImplementedError } from "~/lib/conversation-api"
import { getHistoryConfig } from "~/lib/history-selectors"

const props = defineProps<{
  visible: boolean
  anchorEl: HTMLElement | null
  siteId: SupportedSiteId
}>()

const emit = defineEmits<{
  close: []
}>()

// ── 状态 ──
const conversations = ref<HistoryConversation[]>([])
const selectedIds = ref<Set<string>>(new Set())
const searchQuery = ref("")
const isLoading = ref(false)
const statusMessage = ref("")
const statusKind = ref<"" | "success" | "error" | "info">("")
const isApplying = ref(false)
const defaultRule = ref<HistoryRule>({
  id: "default",
  enabled: true,
  olderThanDays: 30,
  protectStarred: true,
  action: "archive",
})

// ── 面板定位 ──
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function updatePosition() {
  if (!props.anchorEl) return
  const anchorRect = props.anchorEl.getBoundingClientRect()
  const panelWidth = 360
  const panelMaxHeight = window.innerHeight * 0.78
  const top = anchorRect.top + anchorRect.height / 2
  const left = anchorRect.left - panelWidth - 12
  const finalLeft = left < 8 ? 8 : left
  const finalTop = Math.max(
    8,
    Math.min(top - panelMaxHeight / 2, window.innerHeight - panelMaxHeight - 8)
  )
  panelStyle.value = {
    position: "fixed",
    left: `${finalLeft}px`,
    top: `${finalTop}px`,
    width: `${panelWidth}px`,
    maxHeight: `${panelMaxHeight}px`,
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await nextTick()
      updatePosition()
      refresh()
    }
  }
)

function onResize() {
  if (props.visible) updatePosition()
}

// ── DOM 提取 ──
let disconnectObserver: (() => void) | null = null

const refresh = () => {
  isLoading.value = true
  try {
    conversations.value = collectConversations(props.siteId)
  } catch (e) {
    statusKind.value = "error"
    statusMessage.value = `提取失败: ${(e as Error).message}`
  } finally {
    isLoading.value = false
  }
}

// ── 计算属性 ──
const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return conversations.value
  return conversations.value.filter((c) => c.title.toLowerCase().includes(q))
})

const allSelected = computed(
  () =>
    filtered.value.length > 0 &&
    filtered.value.every((c) => selectedIds.value.has(c.id))
)

const selectedCount = computed(() => selectedIds.value.size)

const matchedByRule = computed(() => {
  const rule = defaultRule.value
  if (!rule.enabled) return []
  const cutoff = Date.now() - rule.olderThanDays * 24 * 60 * 60 * 1000
  return conversations.value.filter((c) => {
    if (rule.protectStarred && c.starred) return false
    if (c.lastActiveAt === null) return false
    return c.lastActiveAt < cutoff
  })
})

// ── 操作 ──
const toggleSelect = (id: string) => {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filtered.value.map((c) => c.id))
  }
}

const archiveSelectedLocally = (ids: string[]) => {
  const config = getHistoryConfig(props.siteId)
  for (const id of ids) {
    const anchor = document.querySelector<HTMLElement>(
      `${config.threadItemSelector}[id="conversation_${id}"], ${config.threadItemSelector}[href*="/chat/${id}"]`
    )
    if (anchor) {
      anchor.style.display = "none"
      anchor.setAttribute("data-history-archived", "1")
    }
  }
}

const performBatch = async (action: "delete" | "archive") => {
  if (selectedIds.value.size === 0) return
  isApplying.value = true
  statusKind.value = "info"
  statusMessage.value = `正在${action === "delete" ? "删除" : "归档"} ${selectedIds.value.size} 项...`

  const ids = Array.from(selectedIds.value)
  if (action === "archive") {
    archiveSelectedLocally(ids)
    statusKind.value = "success"
    statusMessage.value = `已本地隐藏 ${ids.length} 项`
    selectedIds.value = new Set()
    isApplying.value = false
    return
  }

  try {
    const result = await batchDelete(props.siteId, ids)
    if (result.notImplemented) {
      // API 未实现 → 降级为本地归档
      archiveSelectedLocally(result.succeeded)
      archiveSelectedLocally(ids)
      statusKind.value = "success"
      statusMessage.value =
        "删除 API 未配置，已改为本地隐藏。请等待后续版本支持。"
    } else if (result.failed.length === 0) {
      archiveSelectedLocally(result.succeeded)
      statusKind.value = "success"
      statusMessage.value = `已删除 ${result.succeeded.length} 项`
    } else {
      archiveSelectedLocally(result.succeeded)
      statusKind.value = "error"
      statusMessage.value = `成功 ${result.succeeded.length}，失败 ${result.failed.length}`
    }
    selectedIds.value = new Set()
  } catch (e) {
    statusKind.value = "error"
    statusMessage.value = `操作失败: ${(e as Error).message}`
  } finally {
    isApplying.value = false
  }
}

const applyRuleNow = async () => {
  const matched = matchedByRule.value
  if (matched.length === 0) {
    statusKind.value = "info"
    statusMessage.value = "没有命中规则的会话"
    return
  }
  selectedIds.value = new Set(matched.map((c) => c.id))
  await performBatch(defaultRule.value.action)
}

const formatDate = (ts: number | null): string => {
  if (ts === null) return "未知"
  const diff = Date.now() - ts
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (days === 0) return "今天"
  if (days === 1) return "昨天"
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

// ── 外部点击关闭 ──
function onDocumentClick(e: MouseEvent) {
  if (!props.visible) return
  if (panelRef.value && !panelRef.value.contains(e.target as Node)) {
    emit("close")
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick, true)
  window.addEventListener("resize", onResize)
  disconnectObserver = createConversationObserver(props.siteId, (list) => {
    conversations.value = list
  })
})

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick, true)
  window.removeEventListener("resize", onResize)
  if (disconnectObserver) disconnectObserver()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="panelRef"
      class="history-panel"
      :style="panelStyle"
    >
      <!-- 顶栏 -->
      <div class="panel-header">
        <span class="panel-title">历史会话管理</span>
        <button class="panel-close" type="button" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索标题..."
        />
        <button class="ghost-btn" type="button" @click="refresh">刷新</button>
      </div>

      <!-- 规则 -->
      <div class="rule-row">
        <label class="rule-label">
          <input
            v-model="defaultRule.enabled"
            type="checkbox"
            class="rule-toggle"
          />
          <span>规则</span>
        </label>
        <div class="rule-fields">
          <span class="field-group">
            超过
            <input
              v-model.number="defaultRule.olderThanDays"
              type="number"
              min="1"
              max="3650"
              class="num-input"
            />
            天
          </span>
          <select v-model="defaultRule.action" class="select-input">
            <option value="archive">归档</option>
            <option value="delete">删除</option>
          </select>
        </div>
        <button
          class="apply-btn"
          type="button"
          :disabled="isApplying"
          @click="applyRuleNow"
        >
          应用规则 ({{ matchedByRule.length }})
        </button>
      </div>

      <!-- 全选行 -->
      <div class="list-header">
        <label class="checkbox-item">
          <input
            type="checkbox"
            :checked="allSelected"
            @change="toggleSelectAll"
          />
          <span>全选 · 已选 {{ selectedCount }}</span>
        </label>
        <span class="count">共 {{ filtered.length }} 项</span>
      </div>

      <!-- 列表 -->
      <div class="list">
        <div v-if="filtered.length === 0" class="empty">
          {{ isLoading ? "加载中..." : "暂无会话" }}
        </div>
        <label
          v-for="conv in filtered"
          :key="conv.id"
          class="list-row"
          :class="{ selected: selectedIds.has(conv.id) }"
        >
          <input
            type="checkbox"
            :checked="selectedIds.has(conv.id)"
            @change="toggleSelect(conv.id)"
          />
          <div class="row-main">
            <div class="row-title">
              <span v-if="conv.starred" class="badge star">★</span>
              <span v-if="conv.pinned" class="badge pin">置顶</span>
              {{ conv.title }}
            </div>
            <div class="row-meta">
              <span>{{ formatDate(conv.lastActiveAt) }}</span>
              <span class="dot">·</span>
              <span class="site-tag">{{ conv.site === "doubao" ? "豆包" : "Kimi" }}</span>
            </div>
          </div>
        </label>
      </div>

      <!-- 状态条 -->
      <div v-if="statusMessage" class="status-bar" :class="statusKind">
        {{ statusMessage }}
      </div>

      <!-- 底部操作 -->
      <div class="footer">
        <button
          class="action-btn archive"
          type="button"
          :disabled="isApplying || selectedCount === 0"
          @click="performBatch('archive')"
        >
          归档 ({{ selectedCount }})
        </button>
        <button
          class="action-btn danger"
          type="button"
          :disabled="isApplying || selectedCount === 0"
          @click="performBatch('delete')"
        >
          删除 ({{ selectedCount }})
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.history-panel {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif;
  color: #171717;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 13px;
  font-weight: 600;
}

.panel-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #737373;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #171717;
}

.toolbar {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.search-input {
  flex: 1;
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}

.search-input:focus {
  border-color: #171717;
}

.ghost-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #525252;
}

.ghost-btn:hover {
  background: #f5f5f5;
}

.rule-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  background: rgba(99, 102, 241, 0.04);
  font-size: 12px;
}

.rule-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

.rule-toggle {
  width: 14px;
  height: 14px;
  margin: 0;
}

.rule-fields {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.field-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #525252;
}

.num-input {
  width: 48px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
  outline: none;
}

.select-input {
  height: 24px;
  padding: 0 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 12px;
  background: #fff;
  outline: none;
}

.apply-btn {
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.9);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.apply-btn:hover:not(:disabled) {
  background: rgba(79, 70, 229, 1);
}

.apply-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  font-size: 11px;
  color: #737373;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.count {
  font-variant-numeric: tabular-nums;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.empty {
  padding: 32px 14px;
  text-align: center;
  font-size: 12px;
  color: #a3a3a3;
}

.list-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.list-row:hover {
  background: rgba(0, 0, 0, 0.02);
}

.list-row.selected {
  background: rgba(99, 102, 241, 0.08);
}

.list-row input[type="checkbox"] {
  margin-top: 2px;
  flex-shrink: 0;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 12px;
  font-weight: 500;
  color: #171717;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: #737373;
}

.dot {
  opacity: 0.4;
}

.site-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.08);
  color: rgba(79, 70, 229, 1);
}

.badge {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.badge.star {
  background: rgba(245, 158, 11, 0.15);
  color: rgba(180, 83, 9, 1);
}

.badge.pin {
  background: rgba(99, 102, 241, 0.15);
  color: rgba(67, 56, 202, 1);
}

.status-bar {
  margin: 0 14px 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.status-bar.success {
  background: rgba(34, 197, 94, 0.1);
  color: rgb(21, 128, 61);
}

.status-bar.error {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(185, 28, 28);
}

.status-bar.info {
  background: rgba(99, 102, 241, 0.08);
  color: rgba(67, 56, 202, 1);
}

.footer {
  display: flex;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.action-btn {
  flex: 1;
  height: 32px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: #171717;
  transition: all 0.1s ease;
}

.action-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.action-btn.archive {
  border-color: rgba(99, 102, 241, 0.4);
  color: rgba(67, 56, 202, 1);
}

.action-btn.danger {
  border-color: rgba(239, 68, 68, 0.4);
  color: rgb(185, 28, 28);
}

.action-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.08);
}
</style>