import type { SupportedSiteId } from "~/components/history-types"

/**
 * 站点侧边栏选择器配置。
 *
 * 设计目标：
 * - 复用现有的 `PlatformConfig` map 模式（见 export-conversation.ts）
 * - 提供"线程项"和"时间标签"的最小选择器集
 * - star / pinned 选择器为可选，DOM 探测不到时降级为 false
 */
export interface HistorySiteConfig {
  /** 站点 ID */
  siteId: SupportedSiteId
  /** 会话列表项选择器（侧边栏中的 <a> 或 <div>） */
  threadItemSelector: string
  /** 会话标题选择器（在 threadItem 内） */
  titleSelector: string
  /** 时间标签选择器（相对时间文字，如 "3天前"），可选 */
  timeLabelSelector?: string
  /** 星标选择器（threadItem 内是否存在），可选 */
  starredSelector?: string
  /** 置顶选择器，可选 */
  pinnedSelector?: string
  /** 标签 */
  label: string
}

export const HISTORY_CONFIGS: Record<SupportedSiteId, HistorySiteConfig> = {
  doubao: {
    siteId: "doubao",
    threadItemSelector: 'a[data-testid="chat_list_thread_item"]',
    titleSelector: '[data-testid="chat_list_item_title"]',
    timeLabelSelector: '[data-testid="chat_list_item_time"]',
    starredSelector: '[data-testid="chat_list_item_starred"]',
    pinnedSelector: '[data-testid="chat_list_item_pinned"]',
    label: "豆包",
  },
  kimi: {
    siteId: "kimi",
    // Kimi 侧边栏选择器（待抓包确认后调整）
    threadItemSelector: '[data-testid="chat-list-item"], .chat-item, aside a[href*="/chat/"]',
    titleSelector: ".chat-item-title, .title, .name",
    timeLabelSelector: ".chat-item-time, .time, [data-time]",
    starredSelector: ".icon-star, [data-starred='true']",
    pinnedSelector: ".icon-pin, [data-pinned='true']",
    label: "Kimi",
  },
}

export const detectHistorySite = (hostname: string): SupportedSiteId | null => {
  const host = hostname.trim().toLowerCase()
  if (!host) return null
  if (host === "doubao.com" || host.endsWith(".doubao.com")) return "doubao"
  if (host === "kimi.com" || host.endsWith(".kimi.com")) return "kimi"
  return null
}

export const getHistoryConfig = (siteId: SupportedSiteId): HistorySiteConfig =>
  HISTORY_CONFIGS[siteId]