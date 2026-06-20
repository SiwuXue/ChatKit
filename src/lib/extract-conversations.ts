import type { HistoryConversation, SupportedSiteId } from "~/components/history-types"
import { getHistoryConfig } from "./history-selectors"

/**
 * 将中文相对时间字符串解析为 epoch ms。
 *
 * 支持的常见模式（覆盖主流中文 UI）：
 * - "刚刚" / "刚刚"            → Date.now()
 * - "X 分钟前" / "X 分钟前"    → Date.now() - X * 60s
 * - "X 小时前"                 → Date.now() - X * 3600s
 * - "今天 HH:MM"               → 当天 HH:MM
 * - "昨天 HH:MM"               → 昨天 HH:MM
 * - "X 天前"                   → Date.now() - X * 86400s
 * - "X 周前"                   → Date.now() - X * 7d
 * - "MM-DD" 或 "YYYY-MM-DD"    → 该日 00:00
 *
 * 无法解析返回 null。
 */
export const parseRelativeTime = (text: string): number | null => {
  if (!text) return null
  const raw = text.trim().replace(/\s+/g, " ")
  if (!raw) return null

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  if (/^刚刚$/.test(raw)) return now.getTime()

  const minutesMatch = raw.match(/^(\d+)\s*分钟前$/)
  if (minutesMatch) {
    return now.getTime() - Number(minutesMatch[1]) * 60 * 1000
  }

  const hoursMatch = raw.match(/^(\d+)\s*小时前$/)
  if (hoursMatch) {
    return now.getTime() - Number(hoursMatch[1]) * 60 * 60 * 1000
  }

  const daysMatch = raw.match(/^(\d+)\s*天前$/)
  if (daysMatch) {
    return now.getTime() - Number(daysMatch[1]) * 24 * 60 * 60 * 1000
  }

  const weeksMatch = raw.match(/^(\d+)\s*周前$/)
  if (weeksMatch) {
    return now.getTime() - Number(weeksMatch[1]) * 7 * 24 * 60 * 60 * 1000
  }

  const monthsMatch = raw.match(/^(\d+)\s*个月前$/)
  if (monthsMatch) {
    return now.getTime() - Number(monthsMatch[1]) * 30 * 24 * 60 * 60 * 1000
  }

  const yearsMatch = raw.match(/^(\d+)\s*年前$/)
  if (yearsMatch) {
    return now.getTime() - Number(yearsMatch[1]) * 365 * 24 * 60 * 60 * 1000
  }

  const todayTimeMatch = raw.match(/^今天\s*(\d{1,2}):(\d{2})$/)
  if (todayTimeMatch) {
    const hh = Number(todayTimeMatch[1])
    const mm = Number(todayTimeMatch[2])
    return startOfDay + hh * 60 * 60 * 1000 + mm * 60 * 1000
  }

  const yesterdayTimeMatch = raw.match(/^昨天\s*(\d{1,2}):(\d{2})$/)
  if (yesterdayTimeMatch) {
    const hh = Number(yesterdayTimeMatch[1])
    const mm = Number(yesterdayTimeMatch[2])
    return (
      startOfDay -
      24 * 60 * 60 * 1000 +
      hh * 60 * 60 * 1000 +
      mm * 60 * 1000
    )
  }

  const mdMatch = raw.match(/^(\d{1,2})-(\d{1,2})$/)
  if (mdMatch) {
    const month = Number(mdMatch[1]) - 1
    const day = Number(mdMatch[2])
    return new Date(now.getFullYear(), month, day).getTime()
  }

  const ymdMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymdMatch) {
    return new Date(
      Number(ymdMatch[1]),
      Number(ymdMatch[2]) - 1,
      Number(ymdMatch[3])
    ).getTime()
  }

  return null
}

/**
 * 从 DOM 锚点提取会话 ID。
 */
const extractId = (anchor: HTMLElement): string => {
  if (anchor.id?.startsWith("conversation_")) {
    return anchor.id.slice("conversation_".length)
  }
  const href = anchor.getAttribute("href") ?? ""
  const fromHref = /\/chat\/([^/?#]+)/.exec(href)?.[1]
  if (fromHref) return fromHref
  // 数据属性兜底
  const dataId = anchor.getAttribute("data-id") ?? anchor.getAttribute("data-conversation-id")
  return dataId ?? ""
}

const extractHref = (anchor: HTMLElement): string => {
  const href = anchor.getAttribute("href") ?? ""
  if (!href) return ""
  try {
    return new URL(href, window.location.origin).toString()
  } catch {
    return href
  }
}

/**
 * 扫描一次 DOM，返回当前可见的会话列表。
 */
export const collectConversations = (
  siteId: SupportedSiteId
): HistoryConversation[] => {
  const config = getHistoryConfig(siteId)
  const anchors = Array.from(
    document.querySelectorAll<HTMLElement>(config.threadItemSelector)
  )

  const seen = new Set<string>()
  const result: HistoryConversation[] = []

  for (const anchor of anchors) {
    const id = extractId(anchor)
    if (!id || seen.has(id)) continue
    seen.add(id)

    const titleEl = config.titleSelector
      ? anchor.querySelector<HTMLElement>(config.titleSelector)
      : null
    const title =
      titleEl?.textContent?.trim() ??
      anchor.textContent?.replace(/\s+/g, " ").trim() ??
      ""

    let lastActiveAt: number | null = null
    if (config.timeLabelSelector) {
      const timeEl = anchor.querySelector<HTMLElement>(config.timeLabelSelector)
      if (timeEl?.textContent) {
        lastActiveAt = parseRelativeTime(timeEl.textContent)
      }
    }

    const starred = config.starredSelector
      ? Boolean(anchor.querySelector(config.starredSelector))
      : false

    const pinned = config.pinnedSelector
      ? Boolean(anchor.querySelector(config.pinnedSelector))
      : false

    result.push({
      id,
      title: title || id,
      href: extractHref(anchor),
      site: siteId,
      starred,
      pinned,
      lastActiveAt,
    })
  }

  return result
}

/**
 * 创建一个 MutationObserver 包装的"持续同步"提取器。
 *
 * - 节流：100ms 内多次 mutation 只触发一次 collect
 * - 卸载：disconnect 返回的 cleanup 即可
 */
export const createConversationObserver = (
  siteId: SupportedSiteId,
  onUpdate: (list: HistoryConversation[]) => void
): (() => void) => {
  let pending = false

  const run = () => {
    pending = false
    try {
      onUpdate(collectConversations(siteId))
    } catch (e) {
      console.warn("[extract-conversations] collect failed", e)
    }
  }

  const schedule = () => {
    if (pending) return
    pending = true
    setTimeout(run, 100)
  }

  // 初次执行
  schedule()

  if (!document.body) return () => undefined

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { subtree: true, childList: true })

  return () => observer.disconnect()
}