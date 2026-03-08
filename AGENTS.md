# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

A Chrome extension for managing AI chat conversations on doubao.com and kimi.com, built with Plasmo + Vue 3 + TypeScript.

## Build Commands

```bash
npm run dev      # Development build (outputs to build/chrome-mv3-dev/)
npm run build    # Production build (outputs to build/chrome-mv3-prod/)
npm run package  # Package for distribution
```

## Path Alias

- `~*` maps to `./src/*` - use for all internal imports (e.g., `import X from "~/components/X"`)

## Code Style (Prettier)

- `semi: false` - No semicolons
- `singleQuote: false` - Use double quotes
- `trailingComma: "none"` - No trailing commas
- Import order: Built-in → Third-party → @plasmo/* → @plasmohq/* → ~/* → ./

## Project Structure

- `src/contents/*.vue` - Content scripts injected into target sites (doubao.com, kimi.com)
- `src/components/*.vue` - Shared Vue components
- `src/lib/site-settings.ts` - Site detection and storage utilities
- `assets/` - Extension icons and static assets

## Storage Keys

- Folder data: `{siteId}-folder-tree-v2` (e.g., "doubao-folder-tree-v2")
- Site settings: `{siteId}-site-settings-v1`
- Legacy migration: "doubao-folder-tree-v1" (auto-migrated on load)

## Content Script Config

Content scripts use `PlasmoCSConfig` with `matches` for specific hostnames:
- Doubao: `https://*.doubao.com/*`
- Kimi: `https://*.kimi.com/*`, `https://*.kimi.moonshot.cn/*`
