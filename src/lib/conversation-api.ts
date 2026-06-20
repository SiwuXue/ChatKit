import type { SupportedSiteId } from "~/components/history-types"

/**
 * 平台删除 API 客户端。
 *
 * 状态：TODO（待逆向）
 *
 * - doubao.com / kimi.com 的删除 endpoint、payload、headers 需要从浏览器抓包分析
 * - 当前实现仅提供"骨架 + 抽象层"，方便后续逆向完成后只填这一个文件
 *
 * 调用方（HistoryManager.vue / background.ts）应捕获 ApiNotImplementedError
 * 并降级到"本地隐藏"行为，避免对用户报错。
 */

export class ApiNotImplementedError extends Error {
  constructor(site: SupportedSiteId, action: "delete" | "archive") {
    super(`API for ${site}.${action} not implemented yet`)
    this.name = "ApiNotImplementedError"
  }
}

export type BatchDeleteResult = {
  succeeded: string[]
  failed: Array<{ id: string; reason: string }>
  notImplemented: boolean
}

/**
 * 单条删除。
 *
 * @throws ApiNotImplementedError 当站点 API 尚未逆向完成
 * @throws Error 其他网络 / 鉴权错误
 */
export const deleteConversation = async (
  site: SupportedSiteId,
  id: string
): Promise<void> => {
  // TODO: 待逆向 doubao / kimi 内部 API 后填充
  // 示例结构：
  //   const endpoint = ENDPOINTS[site].delete
  //   const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ id }) })
  //   if (!response.ok) throw new Error(`delete failed: ${response.status}`)
  throw new ApiNotImplementedError(site, "delete")
}

/**
 * 批量删除（串行 + 失败聚合）。
 */
export const batchDelete = async (
  site: SupportedSiteId,
  ids: string[]
): Promise<BatchDeleteResult> => {
  const result: BatchDeleteResult = {
    succeeded: [],
    failed: [],
    notImplemented: false,
  }

  if (ids.length === 0) return result

  try {
    await deleteConversation(site, ids[0])
  } catch (e) {
    if (e instanceof ApiNotImplementedError) {
      result.notImplemented = true
      return result
    }
    result.failed.push({ id: ids[0], reason: (e as Error).message })
  }

  // 第一个已成功或失败，后面的 ID 都从 index 1 开始串行处理
  for (let i = 1; i < ids.length; i++) {
    const id = ids[i]
    try {
      await deleteConversation(site, id)
      result.succeeded.push(id)
    } catch (e) {
      if (e instanceof ApiNotImplementedError) {
        result.notImplemented = true
        return result
      }
      result.failed.push({ id, reason: (e as Error).message })
    }
  }

  // 第一个 ID 的成功状态需要补回 succeeded
  if (!result.failed.some((f) => f.id === ids[0])) {
    result.succeeded.unshift(ids[0])
  }

  return result
}

/**
 * 单条归档（本地隐藏）。
 *
 * 注意：当前实现是"本地 CSS 隐藏"，由调用方（HistoryManager）负责实际 DOM 操作。
 * 如果后续要支持云端归档，可在此扩展。
 */
export const archiveConversation = async (
  _site: SupportedSiteId,
  _id: string
): Promise<void> => {
  // 本地归档由调用方直接操作 DOM（参考 FolderManager.applyArchiveVisibilityToPage）
  // 此函数作为 future-proof 占位
}