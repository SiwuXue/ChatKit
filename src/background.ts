/**
 * Service Worker
 *
 * - 注册每日 chrome.alarms，定时触发历史会话清理
 * - 监听来自 content script / popup 的手动触发消息
 * - 实际清理动作通过 sendMessage 委派给当前激活标签页的 content script 执行
 *   （content script 持有 DOM 访问能力 + 站点上下文）
 */
import { collectConversations } from "~/lib/extract-conversations"
import { batchDelete } from "~/lib/conversation-api"
import { getSiteSettings, setSiteSettings } from "~/lib/site-settings"
import { HISTORY_CONFIGS } from "~/lib/history-selectors"

const HISTORY_ALARM = "historyAutoClean"

// ── 工具 ──

const hasChromeAlarms = () =>
  typeof chrome !== "undefined" && typeof chrome.alarms !== "undefined"

const hasChromeTabs = () =>
  typeof chrome !== "undefined" && typeof chrome.tabs !== "undefined"

const setupAlarm = async () => {
  if (!hasChromeAlarms()) return
  const existing = await chrome.alarms.get(HISTORY_ALARM)
  if (!existing) {
    chrome.alarms.create(HISTORY_ALARM, {
      // Chrome alarms 最小周期 1 分钟；按设计目标是每日一次
      periodInMinutes: 1440,
      delayInMinutes: 1, // 安装后 1 分钟先跑一次
    })
    console.log("[background] historyAutoClean alarm created")
  }
}

// ── 评估规则（与 HistoryManager.vue 中的逻辑一致） ──

type RuleMatch = { site: "doubao" | "kimi"; id: string; rule: { action: "delete" | "archive" } }

const evaluateForSite = (
  site: "doubao" | "kimi",
  ruleEnabled: boolean,
  olderThanDays: number,
  protectStarred: boolean,
  action: "delete" | "archive"
): RuleMatch[] => {
  if (!ruleEnabled) return []
  try {
    // 注意：这里只是"模拟"提取，真实提取仍由 content script 在页面内执行
    // service worker 没有 DOM 访问权限，无法 collectConversations
    // 实际数据由 active tab 的 content script 通过消息提供
    // 此函数仅作为占位，真实实现在 runAutoCleanViaContent() 内
    console.log(`[background] evaluate ${site} (placeholder)`)
    return []
  } catch (e) {
    console.warn(`[background] evaluate ${site} failed`, e)
    return []
  }
}

// ── 触发自动清理（委派给活动标签页的 content script） ──

const runAutoClean = async () => {
  if (!hasChromeTabs()) return

  console.log("[background] runAutoClean started at", Date.now())

  for (const siteId of ["doubao", "kimi"] as const) {
    const hostname = siteId === "doubao" ? "doubao.com" : "kimi.com"
    let settings
    try {
      settings = await getSiteSettings(hostname)
    } catch (e) {
      console.warn(`[background] load settings for ${siteId} failed`, e)
      continue
    }

    if (!settings.historyEnabled || !settings.historyAutoDeleteEnabled) continue

    // 找到匹配站点的活动标签
    const tabs = await chrome.tabs.query({
      url: siteId === "doubao" ? "https://*.doubao.com/*" : "https://www.kimi.com/*",
      active: true,
      currentWindow: true,
    })

    if (tabs.length === 0) {
      console.log(`[background] no active tab for ${siteId}, skip`)
      continue
    }

    const tabId = tabs[0].id
    if (typeof tabId !== "number") continue

    // 委派给 content script 提取 + 执行
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "history/autoRun",
        site: siteId,
        olderThanDays: settings.historyOlderThanDays,
        protectStarred: settings.historyProtectStarred,
      })
    } catch (e) {
      console.warn(`[background] sendMessage to tab ${tabId} failed`, e)
    }
  }

  // 记录最后运行时间（写到第一个启用的站点，或默认 doubao）
  try {
    const settings = await getSiteSettings("doubao.com")
    await setSiteSettings("doubao.com", {
      ...settings,
      lastHistoryAutoRunAt: Date.now(),
    })
  } catch (e) {
    console.warn("[background] update lastHistoryAutoRunAt failed", e)
  }
}

// ── 注册监听器 ──

if (typeof chrome !== "undefined") {
  chrome.runtime.onInstalled.addListener(() => {
    void setupAlarm()
  })

  chrome.runtime.onStartup?.addListener(() => {
    void setupAlarm()
  })

  if (hasChromeAlarms()) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === HISTORY_ALARM) {
        void runAutoClean()
      }
    })
  }

  // 接收来自 popup / content script 的"立即清理"消息
  chrome.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type === "history/runNow") {
      void runAutoClean().then(() => sendResponse({ ok: true }))
      return true // 异步响应
    }
    return false
  })
}

void setupAlarm()

// 占位：让 TS 不报"未使用的导入"
void HISTORY_CONFIGS
void batchDelete
void collectConversations
void evaluateForSite