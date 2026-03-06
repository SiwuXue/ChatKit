<script setup lang="ts">
import { computed } from "vue"

import type { FolderNode } from "./folder-types"

defineOptions({
  name: "FolderTreeItem"
})

const props = defineProps<{
  folder: FolderNode
  depth: number
  hoveredFolderId: string | null
  activeMoreMenuId: string | null
  activeColorPickerId: string | null
  renameFolderId: string | null
  renameValue: string
  createChildOfId: string | null
  childName: string
  colorOptions: string[]
}>()

const emit = defineEmits<{
  (e: "toggle-expand", id: string): void
  (e: "set-hover", id: string | null): void
  (e: "toggle-menu", id: string): void
  (e: "pin", id: string): void
  (e: "start-create-child", id: string): void
  (e: "start-rename", id: string): void
  (e: "toggle-color-picker", id: string): void
  (e: "pick-color", payload: { id: string; color: string }): void
  (e: "delete", id: string): void
  (e: "update:renameValue", value: string): void
  (e: "confirm-rename", id: string): void
  (e: "cancel-rename"): void
  (e: "update:childName", value: string): void
  (e: "confirm-create-child", parentId: string): void
  (e: "cancel-create-child"): void
}>()

const rowPadding = computed(() => `${props.depth * 16 + 10}px`)
const editorPadding = computed(() => `${props.depth * 16 + 42}px`)
const hasChildren = computed(() => props.folder.children.length > 0)
const isRenaming = computed(() => props.renameFolderId === props.folder.id)
const isCreatingChild = computed(() => props.createChildOfId === props.folder.id)
const showActions = computed(
  () => props.hoveredFolderId === props.folder.id || props.activeMoreMenuId === props.folder.id
)

const onRenameInput = (event: Event) => {
  emit("update:renameValue", (event.target as HTMLInputElement).value)
}

const onChildInput = (event: Event) => {
  emit("update:childName", (event.target as HTMLInputElement).value)
}
</script>

<template>
  <li class="folder-item">
    <div
      class="folder-row"
      :style="{ paddingLeft: rowPadding }"
      @mouseenter="emit('set-hover', folder.id)"
      @mouseleave="emit('set-hover', null)">
      <button
        class="arrow-btn"
        :class="{ collapsed: !folder.expanded, empty: !hasChildren }"
        type="button"
        @click.stop="emit('toggle-expand', folder.id)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M6 3.5L10.5 8L6 12.5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2" />
        </svg>
      </button>

      <span class="folder-icon" :style="{ '--folder-color': folder.color }">
        <svg viewBox="0 0 20 16" aria-hidden="true">
          <path
            d="M2.5 4.2a1.5 1.5 0 0 1 1.5-1.5h4L9.2 4h6.8a1.5 1.5 0 0 1 1.5 1.5v7.3a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"
            fill="none"
            stroke="var(--folder-color)"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7" />
        </svg>
      </span>

      <div class="folder-name-wrap">
        <div v-if="isRenaming" class="inline-editor compact" @click.stop>
          <input
            :value="renameValue"
            class="editor-input"
            placeholder="输入文件夹名称:"
            @input="onRenameInput"
            @keydown.enter.prevent="emit('confirm-rename', folder.id)"
            @keydown.esc.prevent="emit('cancel-rename')" />
          <button class="editor-btn ok" type="button" @click.stop="emit('confirm-rename', folder.id)">
            ✓
          </button>
          <button class="editor-btn cancel" type="button" @click.stop="emit('cancel-rename')">✗</button>
        </div>
        <span v-else class="folder-name" :title="folder.name">{{ folder.name }}</span>
      </div>

      <div class="row-actions" :class="{ visible: showActions }">
        <button
          class="icon-btn"
          type="button"
          :title="folder.pinned ? '已置顶' : '置顶文件夹'"
          @click.stop="emit('pin', folder.id)">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M5.3 2.4h5.4l-1.1 3.6 2.1 2.1H4.2l2.1-2.1zM8 8.1v5.2"
              fill="none"
              :stroke="folder.pinned ? '#d97706' : 'currentColor'"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5" />
          </svg>
        </button>

        <div class="menu-wrap">
          <button class="icon-btn" type="button" title="更多" @click.stop="emit('toggle-menu', folder.id)">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="3" cy="8" r="1.2" fill="currentColor" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              <circle cx="13" cy="8" r="1.2" fill="currentColor" />
            </svg>
          </button>

          <div v-if="activeMoreMenuId === folder.id" class="dropdown item-menu" @click.stop>
            <button class="menu-item" type="button" @click="emit('pin', folder.id)">置顶文件夹</button>
            <button class="menu-item" type="button" @click="emit('start-create-child', folder.id)">
              创建子文件夹
            </button>
            <button class="menu-item" type="button" @click="emit('start-rename', folder.id)">重命名</button>
            <button class="menu-item" type="button" @click="emit('toggle-color-picker', folder.id)">
              更改颜色
            </button>

            <div v-if="activeColorPickerId === folder.id" class="color-picker">
              <button
                v-for="color in colorOptions"
                :key="color"
                class="color-chip"
                :class="{ active: folder.color === color }"
                type="button"
                :style="{ backgroundColor: color }"
                @click="emit('pick-color', { id: folder.id, color })" />
            </div>

            <button class="menu-item danger" type="button" @click="emit('delete', folder.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isCreatingChild" class="inline-editor child-editor" :style="{ paddingLeft: editorPadding }" @click.stop>
      <span class="editor-label">输入文件夹名称:</span>
      <input
        :value="childName"
        class="editor-input"
        placeholder="输入文件夹名称:"
        @input="onChildInput"
        @keydown.enter.prevent="emit('confirm-create-child', folder.id)"
        @keydown.esc.prevent="emit('cancel-create-child')" />
      <button class="editor-btn ok" type="button" @click.stop="emit('confirm-create-child', folder.id)">
        ✓
      </button>
      <button class="editor-btn cancel" type="button" @click.stop="emit('cancel-create-child')">✗</button>
    </div>

    <ul v-if="hasChildren && folder.expanded" class="children-list">
      <FolderTreeItem
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :depth="depth + 1"
        :hovered-folder-id="hoveredFolderId"
        :active-more-menu-id="activeMoreMenuId"
        :active-color-picker-id="activeColorPickerId"
        :rename-folder-id="renameFolderId"
        :rename-value="renameValue"
        :create-child-of-id="createChildOfId"
        :child-name="childName"
        :color-options="colorOptions"
        @toggle-expand="emit('toggle-expand', $event)"
        @set-hover="emit('set-hover', $event)"
        @toggle-menu="emit('toggle-menu', $event)"
        @pin="emit('pin', $event)"
        @start-create-child="emit('start-create-child', $event)"
        @start-rename="emit('start-rename', $event)"
        @toggle-color-picker="emit('toggle-color-picker', $event)"
        @pick-color="emit('pick-color', $event)"
        @delete="emit('delete', $event)"
        @update:renameValue="emit('update:renameValue', $event)"
        @confirm-rename="emit('confirm-rename', $event)"
        @cancel-rename="emit('cancel-rename')"
        @update:childName="emit('update:childName', $event)"
        @confirm-create-child="emit('confirm-create-child', $event)"
        @cancel-create-child="emit('cancel-create-child')" />
    </ul>
  </li>
</template>

<style scoped>
.folder-item {
  list-style: none;
}

.folder-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  border-radius: 10px;
  transition: background-color 0.2s ease;
}

.folder-row:hover {
  background: rgba(92, 101, 118, 0.12);
}

.arrow-btn {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: #636d80;
  cursor: pointer;
  padding: 0;
  transition: transform 0.2s ease;
}

.arrow-btn svg {
  width: 14px;
  height: 14px;
}

.arrow-btn.collapsed {
  transform: rotate(0deg);
}

.arrow-btn:not(.collapsed) {
  transform: rotate(90deg);
}

.arrow-btn.empty {
  opacity: 0.45;
}

.folder-icon {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.folder-icon svg {
  width: 20px;
  height: 16px;
}

.folder-name-wrap {
  min-width: 0;
  flex: 1;
}

.folder-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.row-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  padding-right: 8px;
}

.row-actions.visible {
  opacity: 1;
  pointer-events: auto;
}

.icon-btn {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #6a7386;
  cursor: pointer;
}

.icon-btn:hover {
  color: #2b3342;
  background: rgba(88, 98, 118, 0.14);
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.menu-wrap {
  position: relative;
}

.dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  width: 168px;
  border-radius: 12px;
  border: 1px solid #d2d7e0;
  background: #fff;
  box-shadow: 0 16px 30px rgba(25, 38, 58, 0.16);
  padding: 6px;
  z-index: 20;
}

.menu-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: #1f2937;
  text-align: left;
  font-size: 13px;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}

.menu-item:hover {
  background: #f0f3f8;
}

.menu-item.danger {
  color: #c12a2a;
}

.color-picker {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 8px;
}

.color-chip {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  cursor: pointer;
}

.color-chip.active {
  outline: 2px solid #111827;
  outline-offset: 1px;
}

.inline-editor {
  display: flex;
  align-items: center;
  gap: 6px;
}

.inline-editor.compact {
  width: 100%;
}

.child-editor {
  margin: 4px 0 6px;
  padding-right: 8px;
}

.editor-label {
  color: #667085;
  font-size: 12px;
  flex: 0 0 auto;
}

.editor-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid #cdd4e0;
  border-radius: 8px;
  padding: 0 8px;
  font-size: 13px;
  color: #1f2937;
  background: #fff;
}

.editor-input:focus {
  outline: none;
  border-color: #6b82ff;
  box-shadow: 0 0 0 3px rgba(86, 117, 255, 0.15);
}

.editor-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 0;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.editor-btn.ok {
  color: #175e3b;
  background: #ddf3e4;
}

.editor-btn.cancel {
  color: #8a2f2f;
  background: #f8dfdf;
}

.children-list {
  margin: 0;
  padding: 0;
}
</style>
