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
  dragOverFolderId: string | null
  draggingFolderId: string | null
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
  (e: "folder-drag-over", payload: { id: string; event: DragEvent }): void
  (e: "folder-drag-leave", id: string): void
  (e: "folder-drop", payload: { id: string; event: DragEvent }): void
  (e: "folder-drag-start", id: string): void
  (e: "folder-drag-end"): void
  (e: "toggle-conversation-star", payload: { folderId: string; conversationId: string }): void
  (e: "remove-conversation", payload: { folderId: string; conversationId: string }): void
}>()

const rowPadding = computed(() => `${props.depth * 16 + 10}px`)
const editorPadding = computed(() => `${props.depth * 16 + 42}px`)
const hasChildren = computed(() => props.folder.children.length > 0)
const hasConversations = computed(() => props.folder.conversations.length > 0)
const isRenaming = computed(() => props.renameFolderId === props.folder.id)
const isCreatingChild = computed(() => props.createChildOfId === props.folder.id)
const isDropTarget = computed(() => props.dragOverFolderId === props.folder.id)
const isDraggingSource = computed(() => props.draggingFolderId === props.folder.id)
const showActions = computed(
  () => props.hoveredFolderId === props.folder.id || props.activeMoreMenuId === props.folder.id
)

const onRenameInput = (event: Event) => {
  emit("update:renameValue", (event.target as HTMLInputElement).value)
}

const onChildInput = (event: Event) => {
  emit("update:childName", (event.target as HTMLInputElement).value)
}

const onDragOver = (event: DragEvent) => {
  emit("folder-drag-over", { id: props.folder.id, event })
}

const onDragLeave = (event: DragEvent) => {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  if (current && related && current.contains(related)) {
    return
  }

  emit("folder-drag-leave", props.folder.id)
}

const onDrop = (event: DragEvent) => {
  emit("folder-drop", { id: props.folder.id, event })
}

const onFolderDragStart = (event: DragEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.closest("button,input,a")) {
    event.preventDefault()
    return
  }

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(
      "application/x-folder-node",
      JSON.stringify({ id: props.folder.id })
    )
    event.dataTransfer.setData("text/plain", props.folder.name)
  }

  emit("folder-drag-start", props.folder.id)
}

const onFolderDragEnd = () => {
  emit("folder-drag-end")
}
</script>

<template>
  <li class="folder-item">
    <div
      class="folder-row"
      :class="{ 'drop-target': isDropTarget, 'drag-source': isDraggingSource }"
      :style="{ paddingLeft: rowPadding }"
      draggable="true"
      @mouseenter="emit('set-hover', folder.id)"
      @mouseleave="emit('set-hover', null)"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @dragstart="onFolderDragStart"
      @dragend="onFolderDragEnd">
      <button
        class="arrow-btn"
        :class="{ collapsed: !folder.expanded, empty: !hasChildren && !hasConversations }"
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
        <div v-else class="folder-name-line">
          <span class="folder-name" :title="folder.name">{{ folder.name }}</span>
          <span v-if="folder.conversations.length > 0" class="folder-count">
            {{ folder.conversations.length }}
          </span>
        </div>
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

    <ul v-if="folder.expanded && hasConversations" class="conversation-list" :style="{ paddingLeft: editorPadding }">
      <li
        v-for="conversation in folder.conversations"
        :key="conversation.id"
        class="conversation-item"
        :class="{ starred: conversation.starred }">
        <a class="conversation-link" :href="conversation.href" :title="conversation.title">
          {{ conversation.title }}
        </a>
        <div class="conversation-actions">
          <button
            class="conversation-icon-btn"
            type="button"
            :title="conversation.starred ? '取消标星' : '标星'"
            @click.stop="
              emit('toggle-conversation-star', {
                folderId: folder.id,
                conversationId: conversation.id
              })
            ">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 2.1l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.3l4-.6z"
                fill="none"
                :stroke="conversation.starred ? '#d97706' : 'currentColor'"
                stroke-linejoin="round"
                stroke-width="1.2" />
            </svg>
          </button>
          <button
            class="conversation-icon-btn"
            type="button"
            title="移除归档"
            @click.stop="emit('remove-conversation', { folderId: folder.id, conversationId: conversation.id })">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.6" />
            </svg>
          </button>
        </div>
        <div class="conversation-tooltip">{{ conversation.title }}</div>
      </li>
    </ul>

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
        :drag-over-folder-id="dragOverFolderId"
        :dragging-folder-id="draggingFolderId"
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
        @cancel-create-child="emit('cancel-create-child')"
        @folder-drag-over="emit('folder-drag-over', $event)"
        @folder-drag-leave="emit('folder-drag-leave', $event)"
        @folder-drop="emit('folder-drop', $event)"
        @folder-drag-start="emit('folder-drag-start', $event)"
        @folder-drag-end="emit('folder-drag-end')"
        @toggle-conversation-star="emit('toggle-conversation-star', $event)"
        @remove-conversation="emit('remove-conversation', $event)" />
    </ul>
  </li>
</template>
