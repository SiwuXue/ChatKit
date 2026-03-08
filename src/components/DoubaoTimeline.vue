<script setup lang="ts">
import SiteTimeline from "./SiteTimeline.vue"

type CollectedNode = {
  id: string
  role: "user" | "assistant"
  text: string
  element: HTMLElement
}

const messageSelector = '[data-testid="receive_message"], [data-testid="send_message"], [data-testid="message_content"]'
const messageSelectorCandidates = [
  '[data-testid="receive_message"]',
  '[data-testid="send_message"]',
  '[data-testid="message_content"]',
  '[data-testid="message_text_content"]',
  '.message-content',
  '.chat-message-item'
]
const messageTextSelectorCandidates = [
  '[data-testid="message_text_content"]',
  '.markdown-body',
  '.markdown',
  'p'
]

const normalizeText = (raw: string) => raw.replace(/\s+/g, " ").trim()

const safeCssEscape = (value: string) => {
  const runtimeCss = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS
  if (runtimeCss?.escape) {
    return runtimeCss.escape(value)
  }

  return value.replace(/["\\]/g, "\\$&")
}

const collectNodes = (): CollectedNode[] => {
  const nextNodes: CollectedNode[] = []
  const seen = new Set<string>()
  const seenElements = new Set<HTMLElement>()

  const candidateElements: HTMLElement[] = []
  for (const selector of messageSelectorCandidates) {
    const found = document.querySelectorAll<HTMLElement>(selector)
    found.forEach(el => {
      if (!seenElements.has(el)) {
        candidateElements.push(el)
        seenElements.add(el)
      }
    })
  }

  // Clear seenElements to reuse for content grouping
  seenElements.clear()

  for (let index = 0; index < candidateElements.length; index += 1) {
    let element = candidateElements[index]
    
    // Group by content container if possible
    const contentWrapper = element.closest<HTMLElement>('[data-testid="receive_message"], [data-testid="send_message"]')
    if (contentWrapper) {
      element = contentWrapper
    }

    if (seenElements.has(element)) continue
    seenElements.add(element)

    const fallbackId = `msg-${index + 1}`
    let id = element.dataset.messageId?.trim() || 
             (element.querySelector('[data-message-id]') as HTMLElement)?.dataset?.messageId?.trim() || 
             (element.closest('[data-message-id]') as HTMLElement)?.dataset?.messageId?.trim() || 
             fallbackId
    
    if (seen.has(id)) {
      id = `${id}-${index}`
    }
    seen.add(id)

    const textElement = messageTextSelectorCandidates.reduce<HTMLElement | null>(
      (acc, selector) => acc || element.querySelector<HTMLElement>(selector) || (element.matches(selector) ? element : null),
      null
    )
    
    const textContent = (textElement || element).textContent || ""
    const text = normalizeText(textContent)
    if (!text || text.length < 1) continue

    const isUser = !!element.closest('[data-testid="send_message"]') || 
                   !!element.closest('.items-end, .justify-end, [style*="flex-end"]') || 
                   !!element.querySelector('[data-testid="message_status"]')
    
    nextNodes.push({
      id,
      role: isUser ? "user" : "assistant",
      text,
      element
    })
  }

  return nextNodes
}

const resolveTarget = (messageId: string, elementByNodeId: Map<string, HTMLElement>) => {
  const fromMap = elementByNodeId.get(messageId) ?? null
  const escapedId = safeCssEscape(messageId)
  const fromQuery = document.querySelector<HTMLElement>(
    `${messageSelector}[data-message-id="${escapedId}"]`
  )
  return fromMap ?? fromQuery
}
</script>

<template>
  <SiteTimeline
    site-id="doubao"
    highlight-class-name="doubao-timeline-target"
    :collect-nodes="collectNodes"
    :resolve-target="resolveTarget" />
</template>
