export type SupportedSiteId = "doubao" | "kimi"

export type HistoryConversation = {
  id: string
  title: string
  href: string
  site: SupportedSiteId
  starred: boolean
  pinned: boolean
  /** Epoch ms; null 表示无法从 DOM 中推断 */
  lastActiveAt: number | null
}

export type HistoryRuleAction = "delete" | "archive"

export type HistoryRule = {
  id: string
  enabled: boolean
  olderThanDays: number
  protectStarred: boolean
  action: HistoryRuleAction
}

export type HistoryRuleEvaluation = {
  matched: HistoryConversation[]
  rule: HistoryRule
}

export type HistoryAutoRunSummary = {
  startedAt: number
  finishedAt: number
  evaluated: number
  deleted: number
  archived: number
  failed: number
}