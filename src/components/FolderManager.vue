<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"

import FolderTreeItem from "./FolderTreeItem.vue"
import type { FolderNode } from "./folder-types"

const colorOptions = [
  "#6c7a95",
  "#ef4444",
  "#f59e0b",
  "#16a34a",
  "#0ea5e9",
  "#6366f1",
  "#9333ea",
  "#db2777",
  "#64748b",
  "#111827"
]

const createId = () => `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createFolder = (name: string, color = "#6c7a95"): FolderNode => ({
  id: createId(),
  name,
  color,
  pinned: false,
  expanded: true,
  children: []
})

const folders = ref<FolderNode[]>([
  createFolder("浏览器插件开发"),
  createFolder("DrassionPage"),
  createFolder("JS逆向")
])

const rootRef = ref<HTMLElement | null>(null)

const toolbarMenuOpen = ref(false)
const addingRoot = ref(false)
const newRootName = ref("")

const hoveredFolderId = ref<string | null>(null)
const activeMoreMenuId = ref<string | null>(null)
const activeColorPickerId = ref<string | null>(null)

const renameFolderId = ref<string | null>(null)
const renameValue = ref("")

const createChildOfId = ref<string | null>(null)
const childName = ref("")

type LocatedFolder = {
  node: FolderNode
  siblings: FolderNode[]
  index: number
}

const locateFolder = (list: FolderNode[], id: string): LocatedFolder | null => {
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index]

    if (node.id === id) {
      return { node, siblings: list, index }
    }

    const childResult = locateFolder(node.children, id)
    if (childResult) {
      return childResult
    }
  }

  return null
}

const closeContextMenus = () => {
  toolbarMenuOpen.value = false
  activeMoreMenuId.value = null
  activeColorPickerId.value = null
}

const closeInlineEditors = () => {
  renameFolderId.value = null
  renameValue.value = ""
  createChildOfId.value = null
  childName.value = ""
}

const handleGlobalClick = (event: MouseEvent) => {
  if (!rootRef.value) {
    return
  }

  const path = event.composedPath?.() ?? []
  if (path.includes(rootRef.value)) {
    return
  }

  closeContextMenus()
  hoveredFolderId.value = null
}

const toggleToolbarMenu = () => {
  const nextState = !toolbarMenuOpen.value
  closeContextMenus()
  toolbarMenuOpen.value = nextState
}

const runToolbarAction = (action: "import" | "export") => {
  toolbarMenuOpen.value = false
  console.log(`[FolderManager] ${action} folder`)
}

const openAddRoot = () => {
  closeContextMenus()
  closeInlineEditors()
  addingRoot.value = true
  newRootName.value = ""
}

const cancelAddRoot = () => {
  addingRoot.value = false
  newRootName.value = ""
}

const confirmAddRoot = () => {
  const name = newRootName.value.trim()
  if (!name) {
    return
  }

  folders.value.unshift(createFolder(name))
  cancelAddRoot()
}

const toggleExpand = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target || target.node.children.length === 0) {
    return
  }

  target.node.expanded = !target.node.expanded
}

const toggleMoreMenu = (id: string) => {
  toolbarMenuOpen.value = false

  if (activeMoreMenuId.value === id) {
    activeMoreMenuId.value = null
    activeColorPickerId.value = null
    return
  }

  activeMoreMenuId.value = id
  activeColorPickerId.value = null
}

const pinFolder = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  const [item] = target.siblings.splice(target.index, 1)
  item.pinned = true
  target.siblings.unshift(item)

  activeMoreMenuId.value = null
  activeColorPickerId.value = null
}

const startCreateChild = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  closeContextMenus()
  renameFolderId.value = null
  renameValue.value = ""

  target.node.expanded = true
  createChildOfId.value = id
  childName.value = ""
}

const cancelCreateChild = () => {
  createChildOfId.value = null
  childName.value = ""
}

const confirmCreateChild = (parentId: string) => {
  const name = childName.value.trim()
  if (!name) {
    return
  }

  const target = locateFolder(folders.value, parentId)
  if (!target) {
    return
  }

  target.node.children.unshift(createFolder(name, target.node.color))
  target.node.expanded = true

  cancelCreateChild()
}

const startRename = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  closeContextMenus()
  cancelCreateChild()

  renameFolderId.value = id
  renameValue.value = target.node.name
}

const cancelRename = () => {
  renameFolderId.value = null
  renameValue.value = ""
}

const confirmRename = (id: string) => {
  const name = renameValue.value.trim()
  if (!name) {
    return
  }

  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  target.node.name = name
  cancelRename()
}

const toggleColorPicker = (id: string) => {
  activeColorPickerId.value = activeColorPickerId.value === id ? null : id
}

const pickColor = ({ id, color }: { id: string; color: string }) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  target.node.color = color
  activeColorPickerId.value = null
  activeMoreMenuId.value = null
}

const deleteFolder = (id: string) => {
  const target = locateFolder(folders.value, id)
  if (!target) {
    return
  }

  target.siblings.splice(target.index, 1)

  if (renameFolderId.value === id) {
    cancelRename()
  }

  if (createChildOfId.value === id) {
    cancelCreateChild()
  }

  if (activeMoreMenuId.value === id) {
    activeMoreMenuId.value = null
    activeColorPickerId.value = null
  }
}

onMounted(() => {
  document.addEventListener("click", handleGlobalClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener("click", handleGlobalClick, true)
})
</script>

<template>
  <section ref="rootRef" class="folder-panel" @click.stop>
    <header class="toolbar">
      <h2 class="title">文件夹</h2>

      <div class="toolbar-actions">
        <div class="menu-host">
          <button class="top-icon-btn" type="button" title="文件夹菜单" @click.stop="toggleToolbarMenu">
            <svg viewBox="0 0 20 16" aria-hidden="true">
              <path
                d="M2.5 4.2a1.5 1.5 0 0 1 1.5-1.5h4L9.2 4h6.8a1.5 1.5 0 0 1 1.5 1.5v7.3a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7" />
            </svg>
          </button>

          <div v-if="toolbarMenuOpen" class="toolbar-menu" @click.stop>
            <button class="toolbar-item" type="button" @click="runToolbarAction('import')">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 11.8V2.5M5.2 5.4L8 2.5l2.8 2.9M3.2 11.8v1.7h9.6v-1.7"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7" />
              </svg>
              <span>导入文件夹</span>
            </button>

            <button class="toolbar-item" type="button" @click="runToolbarAction('export')">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 2.5v9.3M5.2 8.6L8 11.5l2.8-2.9M3.2 11.8v1.7h9.6v-1.7"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7" />
              </svg>
              <span>导出文件夹</span>
            </button>
          </div>
        </div>

        <button class="top-icon-btn" type="button" title="新增文件夹" @click.stop="openAddRoot">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3v10M3 8h10"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8" />
          </svg>
        </button>
      </div>
    </header>

    <div class="folder-list-wrap">
      <div v-if="addingRoot" class="inline-editor root-editor">
        <span class="editor-label">输入文件夹名称:</span>
        <input
          v-model="newRootName"
          class="editor-input"
          placeholder="输入文件夹名称:"
          @keydown.enter.prevent="confirmAddRoot"
          @keydown.esc.prevent="cancelAddRoot" />
        <button class="editor-btn ok" type="button" @click="confirmAddRoot">✓</button>
        <button class="editor-btn cancel" type="button" @click="cancelAddRoot">✗</button>
      </div>

      <ul class="root-list">
        <FolderTreeItem
          v-for="folder in folders"
          :key="folder.id"
          :folder="folder"
          :depth="0"
          :hovered-folder-id="hoveredFolderId"
          :active-more-menu-id="activeMoreMenuId"
          :active-color-picker-id="activeColorPickerId"
          :rename-folder-id="renameFolderId"
          :rename-value="renameValue"
          :create-child-of-id="createChildOfId"
          :child-name="childName"
          :color-options="colorOptions"
          @toggle-expand="toggleExpand"
          @set-hover="hoveredFolderId = $event"
          @toggle-menu="toggleMoreMenu"
          @pin="pinFolder"
          @start-create-child="startCreateChild"
          @start-rename="startRename"
          @toggle-color-picker="toggleColorPicker"
          @pick-color="pickColor"
          @delete="deleteFolder"
          @update:renameValue="renameValue = $event"
          @confirm-rename="confirmRename"
          @cancel-rename="cancelRename"
          @update:childName="childName = $event"
          @confirm-create-child="confirmCreateChild"
          @cancel-create-child="cancelCreateChild" />
      </ul>
    </div>
  </section>
</template>

<style scoped>
.folder-panel {
  width: 320px;
  border-radius: 16px;
  border: 1px solid #ced6e2;
  background: radial-gradient(circle at 100% 0%, #f5f8fc 0%, #e8edf5 55%);
  box-shadow: 0 16px 36px rgba(17, 29, 48, 0.18);
  color: #1d2636;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 10px;
}

.toolbar {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-host {
  position: relative;
}

.top-icon-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #6e778a;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.top-icon-btn:hover {
  background: rgba(68, 78, 99, 0.16);
  color: #222c3b;
}

.top-icon-btn svg {
  width: 18px;
  height: 18px;
}

.toolbar-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 176px;
  border-radius: 14px;
  border: 1px solid #d6dbe5;
  background: #fff;
  box-shadow: 0 20px 30px rgba(15, 28, 49, 0.18);
  padding: 8px;
  z-index: 28;
}

.toolbar-item {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #243043;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
}

.toolbar-item:hover {
  background: #eef3fa;
}

.toolbar-item svg {
  width: 18px;
  height: 18px;
}

.folder-list-wrap {
  margin-top: 6px;
}

.root-list {
  margin: 0;
  padding: 0;
}

.inline-editor {
  display: flex;
  align-items: center;
  gap: 6px;
}

.root-editor {
  margin: 0 4px 8px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.58);
}

.editor-label {
  color: #596279;
  font-size: 12px;
  white-space: nowrap;
}

.editor-input {
  flex: 1;
  min-width: 0;
  height: 30px;
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
  display: grid;
  place-items: center;
  cursor: pointer;
}

.editor-btn.ok {
  color: #175e3b;
  background: #ddf3e4;
}

.editor-btn.cancel {
  color: #8a2f2f;
  background: #f8dfdf;
}
</style>
