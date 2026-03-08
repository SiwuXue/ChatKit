# Project Overview: Doubao/Kimi Chat Organizer (Plasmo + Vue 3)

A Chrome extension built with the [Plasmo framework](https://docs.plasmo.com/) and [Vue 3](https://vuejs.org/) to enhance the user experience of AI chat platforms (Doubao, Kimi). It provides a hierarchical folder management system for conversations and a timeline visualization for chat history.

## Core Technologies
- **Framework:** Plasmo (v0.90.5) - A specialized framework for building browser extensions.
- **UI Library:** Vue 3 (v3.3.4) with Composition API.
- **Language:** TypeScript.
- **State & Persistence:** Chrome `storage.sync` for cross-device synchronization of settings and folder data.
- **Styling:** Vanilla CSS with CSS Variables for dynamic theme support (spacing, positions).

## Architecture & Key Components

### Content Scripts (`src/contents/`)
- **`Doubao.vue` / `Kimi.vue`:** These are Plasmo content scripts that inject the `FolderManager` component into the respective chat platform websites.
- **Style Injection:** Uses `data-text:` imports to inject scoped CSS into the shadow DOM.

### UI Components (`src/components/`)
- **`FolderManager.vue`:** The central component responsible for managing the folder tree, handling drag-and-drop operations for conversations, and coordinating with storage.
- **`SiteTimeline.vue`:** A generic, reusable component for visualizing chat messages as a timeline. It is specialized for different sites via `DoubaoTimeline.vue` and `KimiTimeline.vue`.
- **`FolderTreeItem.vue`:** Handles the recursive rendering of the folder hierarchy.

### Libraries (`src/lib/`)
- **`site-settings.ts`:** Manages site-specific configurations (enabled status, UI layout settings) and abstracts the `chrome.storage.sync` interactions.
- **`folder-types.ts`:** Defines the data structures for `FolderNode` and `FolderConversation`.

## Key Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Plasmo development server with hot-reload. |
| `npm run build` | Builds a production-ready extension bundle. |
| `npm run package` | Packages the built extension for distribution. |

## Development Conventions

### Coding Style
- **Vue 3 Composition API:** Prefer `<script setup lang="ts">` for components.
- **Type Safety:** Heavily utilizes TypeScript for defining storage schemas and component props.
- **Surgical DOM Interaction:** Content scripts use specific selectors (e.g., `[data-testid="message_content"]`) to interact with the host site's DOM.

### Persistence
- Data is stored in `chrome.storage.sync` using versioned keys (e.g., `folder-tree-v1:doubao`).
- A normalization layer in `site-settings.ts` ensures data integrity when reading from storage.

### Testing & Validation (TODO)
- Currently, the project lacks automated tests. 
- **Validation Strategy:** Manual verification by loading the extension in developer mode (`build/chrome-mv3-dev`) and testing against `doubao.com` and `kimi.com`.
