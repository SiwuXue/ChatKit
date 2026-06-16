/**
 * 豆包无水印下载 — 主世界注入脚本
 * 通过 <script src> 注入到页面主世界，拦截 XHR/fetch 提取无水印 URL
 * 通过 window.postMessage 将数据发送给扩展的 content script
 */
;(function () {
  "use strict"

  if (window.__doubao_ext_dl_injected__) return
  window.__doubao_ext_dl_injected__ = true

  const MAX_DEDUP = 100
  const processedUrls = []

  function extractFileKey(url) {
    if (!url) return null
    const m = url.match(/rc_gen_image\/([^?~]+)/)
    return m ? m[1] : null
  }

  function findVidInObject(obj, depth) {
    if (depth === undefined) depth = 0
    if (depth > 10 || !obj) return null
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const f = findVidInObject(obj[i], depth + 1)
        if (f) return f
      }
    } else if (typeof obj === "object") {
      if (typeof obj.vid === "string" && obj.vid.indexOf("v0") === 0) return obj.vid
      if (typeof obj.video_id === "string" && obj.video_id.indexOf("v0") === 0) return obj.video_id
      const keys = Object.keys(obj)
      for (let j = 0; j < keys.length; j++) {
        const f = findVidInObject(obj[keys[j]], depth + 1)
        if (f) return f
      }
    }
    return null
  }

  function extractImagesFromObject(obj, depth) {
    if (depth === undefined) depth = 0
    let images = []
    if (depth > 8 || !obj) return images
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        images = images.concat(extractImagesFromObject(obj[i], depth + 1))
      }
      return images
    }
    if (typeof obj !== "object") return images

    const creations = obj.creations || (obj.creation_block && obj.creation_block.creations)
    if (creations && Array.isArray(creations)) {
      for (let c = 0; c < creations.length; c++) {
        const cr = creations[c]
        const img = cr && cr.image
        const raw = img && img.image_ori_raw
        if (raw && raw.url) {
          images.push({
            no_watermark_url: raw.url,
            watermark_url: img.image_thumb && img.image_thumb.url,
            width: raw.width,
            height: raw.height,
            key: extractFileKey(raw.url),
          })
        }
      }
    }

    const blocks = obj.content_block || obj.content_blocks
    if (blocks && Array.isArray(blocks)) {
      for (let b = 0; b < blocks.length; b++) {
        images = images.concat(extractImagesFromObject(blocks[b], depth + 1))
      }
    }

    const directImg = obj.image
    if (directImg && directImg.image_ori_raw && directImg.image_ori_raw.url) {
      const raw = directImg.image_ori_raw
      images.push({
        no_watermark_url: raw.url,
        width: raw.width,
        height: raw.height,
        key: extractFileKey(raw.url),
      })
    }

    const keys2 = Object.keys(obj)
    for (let k = 0; k < keys2.length; k++) {
      const v = obj[keys2[k]]
      if (v && typeof v === "object") {
        images = images.concat(extractImagesFromObject(v, depth + 1))
      }
    }
    return images
  }

  function extractFromMessages(messages) {
    const images = []
    const videos = []
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const msgId = String(msg.message_id || "").trim()
      if (msgId && msgId !== "0") {
        const vid = findVidInObject(msg)
        if (vid) videos.push({ vid: vid, messageId: msgId })
      }
      images.push.apply(images, extractImagesFromObject(msg))
    }
    return { images: images, videos: videos }
  }

  function extractFromPatchOps(patchOps) {
    let images = []
    for (let i = 0; i < (patchOps || []).length; i++) {
      images = images.concat(extractImagesFromObject(patchOps[i] && patchOps[i].patch_value))
    }
    return images
  }

  function post(type, data) {
    window.postMessage({ __doubao_ext_dl__: true, type: type, data: data }, "*")
  }

  // ── XHR 拦截 ──
  const OrigXHROpen = XMLHttpRequest.prototype.open
  const OrigXHRSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__dl_url = typeof url === "string" ? url : url.toString()
    return OrigXHROpen.apply(this, arguments)
  }

  XMLHttpRequest.prototype.send = function () {
    const self = this
    this.addEventListener("load", function () {
      const url = self.__dl_url
      if (url && url.indexOf("chain/single") !== -1 && processedUrls.indexOf(url) === -1) {
        try {
          const data = JSON.parse(self.responseText)
          const messages =
            data && data.downlink_body &&
            data.downlink_body.pull_singe_chain_downlink_body &&
            data.downlink_body.pull_singe_chain_downlink_body.messages
          if (messages) {
            const result = extractFromMessages(messages)
            if (result.images.length) post("image-data", result.images)
            if (result.videos.length) post("video-data", result.videos)
          }
          processedUrls.push(url)
          if (processedUrls.length > MAX_DEDUP) processedUrls.shift()
        } catch (e) {}
      }
    })
    return OrigXHRSend.apply(this, arguments)
  }

  // ── Fetch 拦截 (SSE) ──
  const origFetch = window.fetch
  window.fetch = function () {
    const input = arguments[0]
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : input && input.url
    if (url && url.indexOf("chat/completion") !== -1 && processedUrls.indexOf(url) === -1) {
      processedUrls.push(url)
      const responsePromise = origFetch.apply(this, arguments)
      responsePromise.then(function (response) {
        const ct = response.headers.get("content-type") || ""
        if (ct.indexOf("text/event-stream") !== -1) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          function pump() {
            reader.read().then(function (r) {
              if (r.done) return
              buffer += decoder.decode(r.value, { stream: true })
              const parts = buffer.split("\n\n")
              buffer = parts.pop() || ""
              for (let p = 0; p < parts.length; p++) {
                const match = parts[p].match(/^data: (.+)$/m)
                if (match) {
                  try {
                    const data = JSON.parse(match[1])
                    const images = extractFromPatchOps(data && data.patch_op)
                    if (images.length) post("image-data", images)
                    if (data && data.message_id && data.patch_op) {
                      for (let o = 0; o < data.patch_op.length; o++) {
                        const vid = findVidInObject(
                          data.patch_op[o] && data.patch_op[o].patch_value)
                        if (vid && data.message_id) {
                          post("video-data", [{ vid: vid, messageId: data.message_id }])
                        }
                      }
                    }
                  } catch (e) {}
                }
              }
              pump()
            }).catch(function () {})
          }
          pump()
        }
      }).catch(function () {})
      return responsePromise
    }
    return origFetch.apply(this, arguments)
  }

  function scanInit() {
    try {
      const rd = window._ROUTER_DATA
      if (rd && rd.loaderData && rd.loaderData.chat_layout) {
        const cells = rd.loaderData.chat_layout.trimmedChainRecentConvCells || []
        for (let i = 0; i < cells.length; i++) {
          const messages = cells[i] && cells[i].conversation && cells[i].conversation.messages
          if (messages) {
            const result = extractFromMessages(messages)
            if (result.images.length) post("image-data", result.images)
            if (result.videos.length) post("video-data", result.videos)
          }
        }
      }
    } catch (e) {}

    setTimeout(function () {
      try {
        const imgs = document.querySelectorAll("img[src*='rc_gen_image']")
        for (let j = 0; j < imgs.length; j++) {
          const img = imgs[j], key = extractFileKey(img.src)
          if (!key) continue
          const parent = img.closest('[class*="message"], [class*="creation"]')
          if (!parent) continue
          const allImgs = parent.querySelectorAll("img")
          for (let k = 0; k < allImgs.length; k++) {
            const other = allImgs[k], otherKey = extractFileKey(other.src)
            if (otherKey && otherKey !== key && other.src.indexOf("watermark") === -1) {
              post("image-data", [{ no_watermark_url: other.src, key: otherKey }])
              break
            }
          }
        }
      } catch (e) {}
    }, 1000)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanInit)
  } else {
    scanInit()
  }
})()
