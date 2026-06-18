/**
 * 对话导出核心逻辑
 *
 * 平台选择器配置、消息提取、各格式生成。
 */
import { htmlToMarkdown } from "./html-to-markdown"

// ── 类型 ──

export interface ExportMessage {
  role: "user" | "assistant"
  content: string
}

export interface ExportMetadata {
  title: string
  url: string
  exportTime: string
  source: string
}

export type ExportFormat = "markdown" | "txt" | "docx" | "pdf"

// ── 平台选择器配置 ──

interface PlatformConfig {
  /** 消息块选择器（v_list_row 层级） */
  messageBlockSelector: string
  /** 用户消息识别：block 内有此选择器即为用户消息 */
  userIndicatorSelector: string
  /** AI 消息的 Markdown 内容容器 */
  assistantMarkdownSelector: string
  /** 用户消息的文本容器 */
  userTextSelector: string
  /** 站点名称 */
  label: string
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  "doubao.com": {
    messageBlockSelector: '[data-observe-row^="block_"]',
    userIndicatorSelector: '[data-foundation-type="send-message-action-bar"]',
    assistantMarkdownSelector: ".md-box-root",
    userTextSelector: ".whitespace-pre-wrap.wrap-anywhere",
    label: "豆包",
  },
  "kimi.com": {
    messageBlockSelector: '[data-observe-row^="block_"]',
    userIndicatorSelector: '[data-foundation-type="send-message-action-bar"]',
    assistantMarkdownSelector: ".md-box-root",
    userTextSelector: ".whitespace-pre-wrap.wrap-anywhere",
    label: "Kimi",
  },
}

function detectPlatform(): PlatformConfig {
  const hostname = window.location.hostname
  for (const [key, config] of Object.entries(PLATFORM_CONFIGS)) {
    if (hostname.endsWith(key)) return config
  }
  // 兜底：尝试 doubao 配置
  return PLATFORM_CONFIGS["doubao.com"]
}

// ── 消息提取 ──

/**
 * 判断一个 block 是否为用户消息
 */
function isUserBlock(block: Element, config: PlatformConfig): boolean {
  return block.querySelector(config.userIndicatorSelector) !== null
}

/**
 * 从用户消息 block 中提取文本
 */
function extractUserText(block: Element, config: PlatformConfig): string {
  const textEl = block.querySelector(config.userTextSelector)
  return textEl?.textContent?.trim() || ""
}

/**
 * 从 AI 消息 block 中提取 Markdown 内容
 */
function extractAssistantMarkdown(block: Element, config: PlatformConfig): string {
  const mdRoot = block.querySelector(config.assistantMarkdownSelector)
  if (mdRoot) {
    // 克隆节点以避免修改原始 DOM
    const clone = mdRoot.cloneNode(true) as HTMLElement
    return htmlToMarkdown(clone)
  }
  // 降级：提取纯文本
  return block.textContent?.trim() || ""
}

/**
 * 从页面提取对话消息
 *
 * 将 v_list_row 级别的 block 合并为消息轮次：
 * - 用户消息：独立一轮
 * - 连续 AI 块：合并为一轮
 */
export function extractConversation(): ExportMessage[] {
  const config = detectPlatform()
  const blockRows = document.querySelectorAll(config.messageBlockSelector)

  if (blockRows.length === 0) return []

  const messages: ExportMessage[] = []
  let aiBlocks: Element[] = []

  for (const block of Array.from(blockRows)) {
    if (isUserBlock(block, config)) {
      // 先提交累积的 AI 块
      if (aiBlocks.length > 0) {
        const content = aiBlocks.map((b) => extractAssistantMarkdown(b, config))
          .filter(Boolean)
          .join("\n\n")
        if (content) {
          messages.push({ role: "assistant", content })
        }
        aiBlocks = []
      }
      // 用户消息
      const text = extractUserText(block, config)
      if (text) {
        messages.push({ role: "user", content: text })
      }
    } else {
      aiBlocks.push(block)
    }
  }

  // 最后一组 AI 块
  if (aiBlocks.length > 0) {
    const content = aiBlocks.map((b) => extractAssistantMarkdown(b, config))
      .filter(Boolean)
      .join("\n\n")
    if (content) {
      messages.push({ role: "assistant", content })
    }
  }

  return messages
}

/**
 * 提取视口中心最近的单条 Q&A（用户消息 + 紧随的 AI 回复）
 */
export function extractCurrentQAPair(): ExportMessage[] {
  const config = detectPlatform()
  const blockRows = Array.from(document.querySelectorAll(config.messageBlockSelector))
  if (blockRows.length === 0) return []

  // 找到视口中心最近的 block
  const viewCenter = window.innerHeight / 2
  let bestBlock: Element | null = null
  let bestDist = Infinity
  let bestIdx = -1

  blockRows.forEach((block, i) => {
    const rect = block.getBoundingClientRect()
    const center = rect.top + rect.height / 2
    const dist = Math.abs(center - viewCenter)
    if (dist < bestDist) {
      bestDist = dist
      bestBlock = block
      bestIdx = i
    }
  })

  if (!bestBlock) return []

  // 确定这条消息的类型和起始位置
  const isUser = isUserBlock(bestBlock, config)
  let startIdx = bestIdx
  let endIdx = bestIdx

  if (isUser) {
    // 用户消息：从当前用户消息开始，到下一个用户消息之前（即：当前 Q&A 对）
    // 向前找最近的用户消息
    for (let i = bestIdx - 1; i >= 0; i--) {
      if (isUserBlock(blockRows[i], config)) {
        startIdx = i
        break
      }
    }
    // 向后找下一个用户消息或末尾
    for (let i = bestIdx + 1; i < blockRows.length; i++) {
      if (isUserBlock(blockRows[i], config)) {
        endIdx = i - 1
        break
      }
      endIdx = i
    }
  } else {
    // AI 消息：向前找最近的用户消息作为起点
    for (let i = bestIdx - 1; i >= 0; i--) {
      if (isUserBlock(blockRows[i], config)) {
        startIdx = i
        break
      }
    }
    // endIdx 已经是当前 AI 组的末尾（或到下一个用户之前）
    for (let i = bestIdx + 1; i < blockRows.length; i++) {
      if (isUserBlock(blockRows[i], config)) {
        endIdx = i - 1
        break
      }
      endIdx = i
    }
  }

  // 构建消息列表
  const messages: ExportMessage[] = []
  let aiBlocks: Element[] = []

  for (let i = startIdx; i <= endIdx; i++) {
    const block = blockRows[i]
    if (isUserBlock(block, config)) {
      if (aiBlocks.length > 0) {
        const content = aiBlocks.map((b) => extractAssistantMarkdown(b, config))
          .filter(Boolean)
          .join("\n\n")
        if (content) messages.push({ role: "assistant", content })
        aiBlocks = []
      }
      const text = extractUserText(block, config)
      if (text) messages.push({ role: "user", content: text })
    } else {
      aiBlocks.push(block)
    }
  }

  if (aiBlocks.length > 0) {
    const content = aiBlocks.map((b) => extractAssistantMarkdown(b, config))
      .filter(Boolean)
      .join("\n\n")
    if (content) messages.push({ role: "assistant", content })
  }

  return messages
}

// ── 元数据 ──

export function createExportMetadata(title?: string): ExportMetadata {
  const config = detectPlatform()
  return {
    title: title || document.title || "未命名对话",
    url: window.location.href,
    exportTime: new Date().toLocaleString(),
    source: config.label,
  }
}

// ── 格式生成 ──

/** 确保 UTF-8 BOM（Windows 记事本兼容） */
function ensureUtf8Bom(content: string): string {
  return content.startsWith("﻿") ? content : `﻿${content}`
}

const EMOJI_USER = "🙋"
const EMOJI_ASSISTANT = "🤖"

/**
 * 格式化为 Markdown
 */
export function formatToMarkdown(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const lines: string[] = []

  lines.push(`# ${metadata.title}`)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(`- **来源**: ${metadata.source}`)
  lines.push(`- **导出时间**: ${metadata.exportTime}`)
  lines.push(`- **链接**: ${metadata.url}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`## ${EMOJI_USER} 用户`)
    } else {
      lines.push(`## ${EMOJI_ASSISTANT} ${metadata.source}`)
    }
    lines.push("")
    lines.push(msg.content)
    lines.push("")
    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * 格式化为 TXT
 */
export function formatToTXT(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const lines: string[] = []

  lines.push(`标题: ${metadata.title}`)
  lines.push(`来源: ${metadata.source}`)
  lines.push(`导出时间: ${metadata.exportTime}`)
  lines.push(`链接: ${metadata.url}`)
  lines.push("")
  lines.push("=".repeat(50))
  lines.push("")

  for (const msg of messages) {
    lines.push(msg.role === "user" ? "[用户]" : `[${metadata.source}]`)
    lines.push(msg.content)
    lines.push("")
    lines.push("-".repeat(50))
    lines.push("")
  }

  return ensureUtf8Bom(lines.join("\n"))
}

/**
 * 格式化为 Word 兼容 HTML（保存为 .doc）
 */
export function formatToDocxHtml(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const bodyParts: string[] = []

  bodyParts.push(`<h1>${escapeHtml(metadata.title)}</h1>`)
  bodyParts.push("<hr>")
  bodyParts.push(`<p><strong>来源:</strong> ${escapeHtml(metadata.source)}</p>`)
  bodyParts.push(`<p><strong>导出时间:</strong> ${escapeHtml(metadata.exportTime)}</p>`)
  bodyParts.push(`<p><strong>链接:</strong> <a href="${escapeHtml(metadata.url)}">${escapeHtml(metadata.url)}</a></p>`)
  bodyParts.push("<hr>")

  for (const msg of messages) {
    const label = msg.role === "user" ? "用户" : metadata.source
    const emoji = msg.role === "user" ? EMOJI_USER : EMOJI_ASSISTANT
    bodyParts.push(`<h2>${emoji} ${escapeHtml(label)}</h2>`)
    bodyParts.push(`<div>${simpleMarkdownToHtml(msg.content)}</div>`)
    bodyParts.push("<hr>")
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(metadata.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 20px auto; padding: 0 16px; color: #333; }
    h1 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    h2 { font-size: 1.2em; margin-top: 24px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.9em; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    pre code { background: transparent; padding: 0; }
    img { max-width: 100%; }
    hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
${bodyParts.join("\n")}
</body>
</html>`
}

/**
 * 简单的 Markdown → HTML 转换（用于 Word/PDF 输出）
 */
function simpleMarkdownToHtml(md: string): string {
  let html = md
    // 转义 HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = escapeHtml(code)
    return `<pre><code class="language-${lang}">${escaped}</code></pre>`
  })

  // 内联代码
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // 标题
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>")
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  // 粗体 / 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // 无序列表
  html = html.replace(/^(\s*)- (.+)$/gm, "<li>$2</li>")
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")

  // 引用
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")

  // 水平线
  html = html.replace(/^---$/gm, "<hr>")

  // 段落（双换行）
  html = html.replace(/\n\n/g, "</p><p>")
  html = "<p>" + html + "</p>"
  html = html.replace(/<p>\s*<\/p>/g, "")

  // 恢复已转义的 HTML 标签
  html = html.replace(/&lt;(\/?[a-z][a-z0-9]*)\s/g, "<$1 ")
  html = html.replace(/&lt;(\/?[a-z][a-z0-9]*)&gt;/g, "<$1>")

  return html
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ── 文件下载 ──

/**
 * 下载文件到本地
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain;charset=utf-8",
): void {
  try {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error("[Export] Download failed:", err)
  }
}

/**
 * 通过浏览器打印对话框导出 PDF（用户可选择"另存为 PDF"）
 */
export function printToPdf(htmlContent: string): void {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:none;z-index:-1;"
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) {
    console.error("[Export] Cannot access iframe document")
    iframe.remove()
    return
  }

  doc.open()
  doc.write(htmlContent)
  doc.close()

  // 等待内容渲染后触发打印
  iframe.contentWindow?.addEventListener("afterprint", () => {
    setTimeout(() => iframe.remove(), 100)
  })

  setTimeout(() => {
    iframe.contentWindow?.print()
  }, 300)
}

// ── 主入口 ──

const FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: "Markdown (.md)",
  txt: "纯文本 (.txt)",
  docx: "Word 文档 (.doc)",
  pdf: "PDF",
}

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  markdown: ".md",
  txt: ".txt",
  docx: ".doc",
  pdf: ".pdf",
}

const FORMAT_MIME: Record<ExportFormat, string> = {
  markdown: "text/markdown;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  docx: "application/msword;charset=utf-8",
  pdf: "text/html;charset=utf-8",
}

/**
 * 执行导出
 */
export function performExport(
  format: ExportFormat,
  scope: "current" | "all",
): { success: boolean; message?: string } {
  const messages = scope === "current" ? extractCurrentQAPair() : extractConversation()

  if (messages.length === 0) {
    return { success: false, message: "未找到可导出的消息" }
  }

  const metadata = createExportMetadata()
  const label = FORMAT_LABELS[format]
  const ext = FORMAT_EXTENSIONS[format]

  switch (format) {
    case "markdown": {
      const content = formatToMarkdown(metadata, messages)
      downloadFile(content, `conversation${ext}`, FORMAT_MIME[format])
      break
    }
    case "txt": {
      const content = formatToTXT(metadata, messages)
      downloadFile(content, `conversation${ext}`, FORMAT_MIME[format])
      break
    }
    case "docx": {
      const content = formatToDocxHtml(metadata, messages)
      downloadFile(content, `conversation${ext}`, FORMAT_MIME[format])
      break
    }
    case "pdf": {
      const htmlContent = formatToDocxHtml(metadata, messages)
        .replace("max-width: 800px; margin: 20px auto;", "max-width: 100%; margin: 0;")
      printToPdf(htmlContent)
      break
    }
  }

  return { success: true }
}

export { FORMAT_LABELS, FORMAT_EXTENSIONS }
