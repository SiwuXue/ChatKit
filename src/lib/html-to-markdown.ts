/**
 * HTML 转 Markdown
 *
 * 从 Ophel 的 exporter.ts 移植，去除 React/i18n/platform 依赖。
 * 支持：标题、列表、表格、代码块、数学公式、图片、引用、强调、链接。
 */

// 用于在外部标记图片 URL 的属性名
export const EXPORT_MARKDOWN_HREF_ATTR = "data-ck-export-markdown-href"

// ── 工具函数 ──

const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, "\n")

const sanitizeLanguageLabel = (value: string | null | undefined): string => {
  const normalized = value?.split(/\r?\n/)[0]?.trim().toLowerCase() || ""
  if (!normalized || /^(copy|复制)$/.test(normalized)) return ""
  return normalized.replace(/\s+/g, "")
}

const formatInlineMath = (latex: string): string => {
  const normalized = normalizeLineEndings(latex).replace(/\s*\n\s*/g, " ").trim()
  return normalized ? `$${normalized}$` : ""
}

const formatBlockMath = (latex: string): string => {
  const normalized = normalizeLineEndings(latex).trim()
  if (!normalized) return ""
  const shouldUseMultiline =
    normalized.includes("\n") || /(^|[^\\])\\\\($|[^\\])/.test(normalized)
  return shouldUseMultiline ? `\n$$\n${normalized}\n$$\n` : `\n$$${normalized}$$\n`
}

const extractKatexLatex = (element: Element): string => {
  const annotation = element.querySelector('annotation[encoding="application/x-tex"]')
  const annotationText = annotation?.textContent?.trim()
  if (annotationText) return annotationText

  const el = element as HTMLElement
  const dataTex = el.getAttribute("data-tex") || el.getAttribute("data-latex")
  if (dataTex) return dataTex.trim()

  const ariaLabel = el.getAttribute("aria-label")
  if (ariaLabel) return ariaLabel.trim()

  return ""
}

const extractTextWithLineBreaks = (node: Node): string => {
  if (!node) return ""
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const element = node as HTMLElement
  const tag = element.tagName?.toLowerCase() || ""

  if (tag === "br") return "\n"

  if (
    tag === "style" || tag === "script" || tag === "template" ||
    tag === "noscript" || tag === "button" || tag === "svg" ||
    tag === "annotation" || tag === "annotation-xml" ||
    element.classList?.contains("gh-assistant-mermaid") ||
    element.classList?.contains("katex-mathml") ||
    element.classList?.contains("katex-html")
  ) {
    return ""
  }

  return Array.from(element.childNodes).map(extractTextWithLineBreaks).join("")
}

// ── 代码块 ──

const getCodeBlockLanguage = (element: Element): string => {
  const codeEl = element.querySelector("code")
  const codeClassMatch = codeEl?.className.match(/language-([A-Za-z0-9_#+-]+)/)
  const hasCodeMirrorViewer = !!element.querySelector("#code-block-viewer, .cm-editor")

  const candidates = [
    (element as HTMLElement).getAttribute("data-language"),
    (element.querySelector(".cm-content") as HTMLElement | null)?.getAttribute("data-language"),
    codeClassMatch?.[1],
    element.querySelector(".code-block-decoration span")?.textContent,
    hasCodeMirrorViewer
      ? element.querySelector('.sticky [class*="font-medium"]')?.textContent
      : null,
  ]

  for (const candidate of candidates) {
    const language = sanitizeLanguageLabel(candidate)
    if (language) return language
  }

  return ""
}

export function extractCodeBlock(element: Element): { lang: string; code: string } | null {
  const hasStructuredCodeViewer = !!element.querySelector("#code-block-viewer, .cm-editor")
  const cmContent = element.matches(".cm-content")
    ? (element as HTMLElement)
    : (element.querySelector(".cm-content") as HTMLElement | null) ?? null

  if (cmContent) {
    const code = normalizeLineEndings(extractTextWithLineBreaks(cmContent)).replace(/\n+$/, "")
    if (code.trim()) return { lang: getCodeBlockLanguage(element), code }
  }

  const codeEl = element.matches("code")
    ? (element as HTMLElement)
    : (element.querySelector("pre code, code") as HTMLElement | null) ?? null

  if (codeEl) {
    const code = normalizeLineEndings(extractTextWithLineBreaks(codeEl)).replace(/\n+$/, "")
    if (code.trim()) return { lang: getCodeBlockLanguage(element), code }
  }

  if (!hasStructuredCodeViewer) {
    const code = normalizeLineEndings(extractTextWithLineBreaks(element)).replace(/\n+$/, "")
    if (code.trim()) return { lang: getCodeBlockLanguage(element), code }
  }

  return null
}

// ── 列表渲染 ──

type RenderContext = { listDepth: number; inListItem: boolean }

const normalizeListItemContent = (value: string): string =>
  normalizeLineEndings(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()

const prefixMultilineContent = (
  value: string,
  prefix: string,
  continuationIndent: string,
): string => {
  const lines = normalizeLineEndings(value).split("\n")
  const [firstLine = "", ...restLines] = lines
  if (restLines.length === 0) return `${prefix}${firstLine}`
  return [
    `${prefix}${firstLine}`,
    ...restLines.map((line) => (line ? `${continuationIndent}${line}` : "")),
  ].join("\n")
}

// ── 主转换函数 ──

/**
 * 将 HTML 元素转换为 Markdown
 */
export function htmlToMarkdown(el: Element): string {
  if (!el) return ""

  const renderChildren = (element: HTMLElement, context: RenderContext): string =>
    Array.from(element.childNodes)
      .map((child) => processNode(child, context))
      .join("")

  const renderList = (element: HTMLElement, depth: number): string => {
    const ordered = element.tagName.toLowerCase() === "ol"
    const items = Array.from(element.children).filter(
      (child) => child.tagName?.toLowerCase() === "li",
    ) as HTMLElement[]

    const rendered = items
      .map((item, index) => renderListItem(item, depth, ordered ? index + 1 : null))
      .filter(Boolean)
      .join("\n")

    return rendered ? `\n${rendered}\n\n` : ""
  }

  const renderListItem = (
    element: HTMLElement,
    depth: number,
    orderedIndex: number | null,
  ): string => {
    const indent = "  ".repeat(depth)
    const marker = orderedIndex === null ? "-" : `${orderedIndex}.`
    const bodyParts: string[] = []
    const nestedLists: string[] = []

    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childElement = child as HTMLElement
        const childTag = childElement.tagName.toLowerCase()
        if (childTag === "ul" || childTag === "ol") {
          const nested = renderList(childElement, depth + 1).replace(/^\n+|\n+$/g, "")
          if (nested) nestedLists.push(nested)
          continue
        }
      }
      bodyParts.push(processNode(child, { listDepth: depth, inListItem: true }))
    }

    const body = normalizeListItemContent(bodyParts.join(""))
    let result = body
      ? prefixMultilineContent(body, `${indent}${marker} `, `${indent}  `)
      : `${indent}${marker}`

    if (nestedLists.length > 0) {
      result = `${result.trimEnd()}\n${nestedLists.join("\n")}`
    }

    return result
  }

  const processNode = (
    node: Node,
    context: RenderContext = { listDepth: 0, inListItem: false },
  ): string => {
    try {
      if (!node) return ""
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
      if (node.nodeType !== Node.ELEMENT_NODE) return ""

      const element = node as HTMLElement

      // Mermaid 图表
      if (element.classList?.contains("gh-assistant-mermaid")) return ""

      // 数学公式
      if (element.classList?.contains("math-block")) {
        const latex = element.getAttribute("data-math")
        if (latex) return formatBlockMath(latex)
      }
      if (element.classList?.contains("math-inline")) {
        const latex = element.getAttribute("data-math")
        if (latex) return formatInlineMath(latex)
      }
      if (element.classList?.contains("katex-display")) {
        const latex = extractKatexLatex(element)
        if (latex) return formatBlockMath(latex)
      }
      if (element.classList?.contains("katex")) {
        const latex = extractKatexLatex(element)
        if (latex) return formatInlineMath(latex)
      }
      if (element.classList?.contains("katex-mathml")) return ""
      if (element.classList?.contains("katex-html")) return ""

      // 跳过 UI 元素
      if (element.tagName === "BUTTON" || element.tagName === "SVG") return ""

      // CodeMirror
      if (element.classList?.contains("cm-content") && element.getAttribute("data-language")) {
        const cb = extractCodeBlock(element)
        if (cb) return `\n\`\`\`${cb.lang}\n${cb.code}\n\`\`\`\n`
      }
      if (
        element.classList?.contains("cm-cursorLayer") ||
        element.classList?.contains("cm-selectionLayer") ||
        element.classList?.contains("cm-announced")
      ) {
        return ""
      }

      const tag = element.tagName?.toLowerCase() || ""
      if (!tag) return ""

      if (tag === "annotation" || tag === "annotation-xml") return ""
      if (tag === "style" || tag === "script" || tag === "template" || tag === "noscript") return ""

      // 图片
      if (tag === "img") {
        const alt = (element as HTMLImageElement).alt || element.getAttribute("alt") || "图片"
        const src = element.getAttribute("src") || (element as HTMLImageElement).src || ""
        return `![${alt}](${src})`
      }

      // 代码块
      if (tag === "code-block" || tag === "pre") {
        const cb = extractCodeBlock(element)
        if (cb) return `\n\`\`\`${cb.lang}\n${cb.code}\n\`\`\`\n`
      }

      // 内联代码
      if (tag === "code") {
        if (element.parentElement?.tagName.toLowerCase() === "pre") return ""
        return `\`${element.textContent}\``
      }

      // 表格
      if (tag === "table") {
        const rows: string[] = []
        const thead = element.querySelector("thead")
        const tbody = element.querySelector("tbody")
        const getCell = (cell: Element) => cell.textContent?.trim() || ""

        if (thead) {
          const headerRow = thead.querySelector("tr")
          if (headerRow) {
            const headers = Array.from(headerRow.querySelectorAll("td, th")).map(getCell)
            if (headers.some((h) => h)) {
              rows.push("| " + headers.join(" | ") + " |")
              rows.push("| " + headers.map(() => "---").join(" | ") + " |")
            }
          }
        }
        if (tbody) {
          tbody.querySelectorAll("tr").forEach((tr) => {
            const cells = Array.from(tr.querySelectorAll("td, th")).map(getCell)
            if (cells.some((c) => c)) rows.push("| " + cells.join(" | ") + " |")
          })
        }
        if (!thead && !tbody) {
          let isFirst = true
          element.querySelectorAll("tr").forEach((tr) => {
            const cells = Array.from(tr.querySelectorAll("td, th")).map(getCell)
            if (cells.some((c) => c)) {
              rows.push("| " + cells.join(" | ") + " |")
              if (isFirst) {
                rows.push("| " + cells.map(() => "---").join(" | ") + " |")
                isFirst = false
              }
            }
          })
        }
        return rows.length > 0 ? "\n" + rows.join("\n") + "\n" : ""
      }

      if (tag === "table-block" || tag === "ucs-markdown-table") {
        const innerTable = element.querySelector("table")
        if (innerTable) return processNode(innerTable)
      }

      switch (tag) {
        case "h1": return `\n# ${renderChildren(element, context)}\n`
        case "h2": return `\n## ${renderChildren(element, context)}\n`
        case "h3": return `\n### ${renderChildren(element, context)}\n`
        case "h4": return `\n#### ${renderChildren(element, context)}\n`
        case "h5": return `\n##### ${renderChildren(element, context)}\n`
        case "h6": return `\n###### ${renderChildren(element, context)}\n`
        case "strong":
        case "b":
          return `**${renderChildren(element, context)}**`
        case "em":
        case "i":
          return `*${renderChildren(element, context)}*`
        case "a":
          return `[${renderChildren(element, context)}](${element.getAttribute(EXPORT_MARKDOWN_HREF_ATTR) || (element as HTMLAnchorElement).href || ""})`
        case "li":
          return renderListItem(
            element,
            context.listDepth,
            element.parentElement?.tagName?.toLowerCase() === "ol"
              ? Array.from(element.parentElement.children)
                  .filter((child) => child.tagName?.toLowerCase() === "li")
                  .indexOf(element) + 1
              : null,
          )
        case "p":
          return context.inListItem
            ? `${renderChildren(element, context).trim()}\n`
            : `${renderChildren(element, context)}\n\n`
        case "br":
          return "\n"
        case "ul":
        case "ol":
          return renderList(element, context.listDepth)
        case "blockquote": {
          const lines = renderChildren(element, context).replace(/\r\n/g, "\n").split("\n")
          const quoted = lines.map((l: string) => (l.trim().length > 0 ? `> ${l}` : ">"))
          return `\n${quoted.join("\n")}\n`
        }
        default:
          if ((element as HTMLElement).shadowRoot) {
            return Array.from((element as HTMLElement).shadowRoot!.childNodes)
              .map((child) => processNode(child, context))
              .join("")
          }
          return renderChildren(element, context)
      }
    } catch (err) {
      console.error("[htmlToMarkdown] Error processing node:", err)
      return node.textContent || ""
    }
  }

  return processNode(el).trim()
}
