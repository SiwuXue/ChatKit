# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome extension (Manifest V3 via Plasmo + Vue 3 + TypeScript) that augments the AI chat platforms **doubao.com** and **kimi.com** with:

- A hierarchical folder tree for conversations (drag-and-drop, archive).
- A timeline visualization of chat messages.
- Per-site settings (folder spacing, timeline mode, position, etc.).

No backend service. All persistence is `chrome.storage.sync`, keyed per site.

## Build / dev commands

`package.json` only exposes the three Plasmo scripts — there is **no test runner, no linter, no formatter CLI** wired up:

```bash
npm run dev      # Plasmo dev server, hot reload → build/chrome-mv3-dev/
npm run build    # Production bundle → build/chrome-mv3-prod/
npm run package  # Zip the build for store submission
```

Load `build/chrome-mv3-dev/` as an unpacked extension in `chrome://extensions` (Developer mode on). There is no automated test suite; validation is manual against the live sites.

Formatting is governed by `.prettierrc.mjs` (no semicolons, double quotes, no trailing commas, sorted imports via `@ianvs/prettier-plugin-sort-imports`).

## Path alias

`tsconfig.json` maps `~*` → `./src/*`. Use `~/components/Foo` and `~/lib/site-settings` for all internal imports.

## Architecture

### Plasmo entry points

Plasmo auto-discovers these by filename and location:

| File | Role |
| --- | --- |
| `src/popup.vue` | Toolbar popup (320×340). Reads active-tab hostname, auto-selects supported site, exposes core toggles, links to options page. |
| `src/options.vue` | Full-page advanced settings (folder + timeline + danger-zone reset). |
| `src/background.ts` | Service worker — currently a placeholder (`console.log` only). Real work happens in content scripts. |
| `src/contents/Doubao.vue` | Content script for `https://*.doubao.com/*`. Mounts `<FolderManager>` inline into the sidebar. |
| `src/contents/Kimi.vue` | Content script for `https://www.kimi.com/*`. Mounts `<FolderManager>` next to the Kimi `+` button. |
| `src/contents/DoubaoTimelineContent.vue` | Mounts `<DoubaoTimeline>` as a fixed overlay (z-index 2147483647) with MutationObserver to re-mount if the SPA purges it. |
| `src/contents/KimiTimelineContent.vue` | Same pattern for Kimi. |

### Shadow DOM + style injection pattern

Each content script uses this trio:

1. `PlasmoCSConfig.matches` — restricts injection to target hostnames.
2. `getStyle` — `document.createElement("style")` with `data-text:./<file>.css` injected as scoped styles inside the shadow root.
3. `getInlineAnchor` + `mountShadowHost` — choose where the shadow host is inserted. Doubao inserts into `.flex-nowrap` as the first child; Kimi inserts after `.kimi-plus-part`; timeline overlays force `position:fixed` on the host itself.

All four content scripts also install global `error` / `unhandledrejection` listeners that swallow `"Extension context invalidated"` errors that fire during HMR reloads.

### Component tree

```
FolderManager.vue                     ← root, owns folder tree state + storage I/O
└── FolderTreeItem.vue                ← recursive node renderer

DoubaoTimeline.vue / KimiTimeline.vue ← thin wrappers
└── SiteTimeline.vue                  ← generic, reusable timeline renderer
```

`SiteTimeline.vue` is intentionally site-agnostic; per-site wrappers specialize selectors and any site-specific UI quirks.

### Storage (`src/lib/site-settings.ts`)

Two namespaced, versioned key families in `chrome.storage.sync`:

| Data | Key pattern | Defined by |
| --- | --- | --- |
| Folder tree | `folder-tree-v1:<siteId>` (or `folder-tree-v1:host:<hostname>` for unknown hosts) | `getFolderStorageKey` |
| Site settings | `site-settings-v1:<siteId>` (or `…:host:<hostname>`) | `getSiteSettingsStorageKey` |
| Legacy v1 (doubao only) | `doubao-folder-tree-v1` | `FolderManager.vue` migrates on load |

`SiteSettings` includes: `enabled`, `hideArchivedConversations`, `folderSpacing` (0–16), `timelineScrollMode` (`"flow"|"jump"`), `timelineHideOutsideContainer`, `timelineDraggable`, `timelinePreventAutoJump`, `timelineEnableNodeHierarchy`, `timelineTop` (0–1000), `timelineRight` (0–500).

`supportedSites` is the single source of truth: `{ id: "doubao", hostname: "doubao.com", label: "豆包" }` and `{ id: "kimi", hostname: "kimi.com", label: "Kimi" }`. `detectSupportedSite` does suffix matching (so `www.doubao.com` resolves to `doubao`). Adding a new platform means: extend `supportedSites`, add a content script under `src/contents/`, optionally add a `*Timeline.vue` wrapper if host-specific behavior is needed.

`normalizeSiteSettings` is the integrity boundary — every value read from storage passes through it. When extending `SiteSettings`, add a field here, set a default in `defaultSettings`, and add a `normalizeX` helper that clamps to a sane range. Never persist raw user input without normalization.

### Folder data model (`src/components/folder-types.ts`)

```ts
FolderNode        { id, name, color, pinned, expanded, children: FolderNode[], conversations: FolderConversation[] }
FolderConversation { id, title, href, starred }
```

A folder contains both sub-folders (`children`) and leaf conversations (`conversations`) — not separate collections.

### Host-site DOM interaction

Content scripts use surgical selectors to avoid coupling to the SPA's class names where data attributes exist:

- Doubao: `[data-testid="chat_list_thread_item"]`, `[data-testid="chat_list_item_title"]`, `[data-testid="message_content"]`.
- Kimi: `.kimi-plus-part` (mount anchor).

When a host site changes its DOM, prefer updating the selectors here over restructuring components.

## Notes for future changes

- **Background script is empty.** Adding real messaging, alarms, or cross-tab sync goes in `src/background.ts`.
- **No tests.** If adding tests, pick a runner compatible with Plasmo's Vue + TS pipeline (Vitest is the conventional choice) and wire it into `package.json` scripts — none exist today.
- **Docs in `docs/`** are forward-looking feature designs (memory system, recommendations). They are aspirational, not specs of current behavior.
- `src/contents/doubao-ui.css` is imported by both `Doubao.vue` and `Kimi.vue` despite its name — folder UI styles are shared. Renaming would require updating both imports.