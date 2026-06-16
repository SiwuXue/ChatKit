// 豆包无水印下载 — 纯逻辑层（不依赖 Vue）
// 网络拦截由 doubao-download-main.ts 注入到页面主世界完成
// 此文件提供: 共享状态、下载函数、视频 API

// ==================== 类型 ====================

export interface DoubaoImageData {
  no_watermark_url: string
  watermark_url?: string
  width?: number
  height?: number
  key: string | null
}

export interface VideoData {
  vid: string
  messageId: string
}

// ==================== 工具函数 ====================

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function extractFileKey(url: string): string | null {
  if (!url) return null
  const match = url.match(/rc_gen_image\/([^?~]+)/)
  return match ? match[1] : null
}

function replaceWatermarkParam(url: string): string {
  if (!url) return url
  return url.replace(
    /lr=video_gen_watermark(?:_dyn)?/g,
    "lr=video_gen_no_watermark"
  )
}

// ==================== API 调用 ====================

async function callGetPlayInfo(
  videoKey: string
): Promise<{ mainUrl: string; backupUrl?: string } | null> {
  const url = `https://www.doubao.com/samantha/media/get_play_info?aid=497858&device_platform=web&samantha_web=1&web_tab_id=${generateUUID()}`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "agw-js-conv": "str",
      },
      credentials: "include",
      body: JSON.stringify({ key: videoKey, type: "video" }),
    })

    const json = await response.json()
    if (json.code !== 0) {
      console.warn("[doubao-download] get_play_info error:", json.code)
      return null
    }

    const originalMedia = json.data?.original_media_info
    if (originalMedia?.main_url) {
      return {
        mainUrl: replaceWatermarkParam(originalMedia.main_url),
        backupUrl: originalMedia.backup_url
          ? replaceWatermarkParam(originalMedia.backup_url)
          : undefined,
      }
    }

    const playInfo =
      json.data?.play_infos?.[0] || json.data?.play_info
    if (playInfo?.main) {
      return { mainUrl: replaceWatermarkParam(playInfo.main) }
    }
    return null
  } catch (err) {
    console.warn("[doubao-download] get_play_info failed:", err)
    return null
  }
}

async function callDoubaoShareSave(
  messageId: string
): Promise<unknown> {
  return new Promise((resolve) => {
    function handler(ev: MessageEvent) {
      if (ev.data?.type === "doubaoShareSaveResult") {
        window.removeEventListener("message", handler)
        resolve(ev.data.data)
      }
    }
    window.postMessage({ type: "doubaoShareSave", messageId }, "*")
    window.addEventListener("message", handler)
    setTimeout(() => {
      window.removeEventListener("message", handler)
      resolve(null)
    }, 15000)
  })
}

async function callGetVideoShareInfo(
  shareId: string,
  vid: string
): Promise<unknown> {
  const url = `https://www.doubao.com/creativity/share/get_video_share_info?web_tab_id=${generateUUID()}`
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "agw-js-conv": "str",
      },
      credentials: "include",
      body: JSON.stringify({ share_id: shareId, vid, creation_id: "" }),
    })
    const json = await resp.json()
    return json.code === 0 ? json.data : null
  } catch {
    return null
  }
}

// ==================== 下载函数 ====================

export async function downloadFile(
  url: string,
  filename: string
): Promise<void> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  } catch {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

// ==================== 视频下载编排 ====================

export async function startVideoDownloadByMessageId(
  messageId: string,
  videoCache: Map<string, string>
): Promise<{ success: boolean; videoUrl?: string; messageId: string }> {
  const vid = videoCache.get(messageId)
  if (!vid) return { success: false, messageId }

  try {
    const result = await callGetPlayInfo(vid)
    if (result?.mainUrl) {
      return { success: true, videoUrl: result.mainUrl, messageId }
    }
  } catch {
    // 继续尝试方式2
  }

  const share = await callDoubaoShareSave(messageId)
  if (share && typeof share === "object") {
    const s = share as Record<string, unknown>
    if (s.share_id) {
      const videoData = await callGetVideoShareInfo(
        s.share_id as string,
        vid
      )
      if (videoData && typeof videoData === "object") {
        const vd = videoData as Record<string, unknown>
        const playInfo = (
          vd.play_infos as Record<string, unknown>[]
        )?.[0]
        if (playInfo?.main) {
          return {
            success: true,
            videoUrl: replaceWatermarkParam(playInfo.main as string),
            messageId,
          }
        }
      }
    }
  }

  return { success: false, messageId }
}

// ==================== 模块级数据存储 ====================

export const imageDataMap = new Map<string, DoubaoImageData>()
export const videoCache = new Map<string, string>()
