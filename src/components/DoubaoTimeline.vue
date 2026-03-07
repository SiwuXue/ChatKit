<script setup lang="ts">
import SiteTimeline from "./SiteTimeline.vue"

type CollectedNode = {
  id: string
  role: "user" | "assistant"
  text: string
  element: HTMLElement
}

const messageSelector = '[data-testid="message_content"][data-message-id]'
const messageSelectorCandidates = [
  '[data-testid="message_content"][data-message-id]',
  '[data-testid="message_content"]',
  '[data-message-id]'
]
const messageTextSelectorCandidates = [
  '[data-testid="message_text_content"]',
  '[data-testid*="message_text"]',
  ".markdown-body",
  ".markdown"
]

const normalizeText = (raw: string) => raw.replace(/\s+/g, " ").trim()

const safeCssEscape = (value: string) => {
  const runtimeCss = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS
  if (runtimeCss?.escape) {
    return runtimeCss.escape(value)
  }

  return value.replace(/["\\]/g, "\\$&")
}

const collectCandidateElements = () => {
  const seen = new Set<HTMLElement>()
  const result: HTMLElement[] = []

  for (const selector of messageSelectorCandidates) {
    const elements = document.querySelectorAll<HTMLElement>(selector)
    for (const element of elements) {
      if (seen.has(element)) {
        continue
      }
      seen.add(element)
      result.push(element)
    }
  }

  return result
}

const collectNodes = (): CollectedNode[] => {
  const messageElements = collectCandidateElements()
  const nextNodes: CollectedNode[] = []
  const seen = new Set<string>()

  for (let index = 0; index < messageElements.length; index += 1) {
    const sourceElement = messageElements[index]
    const element =
      sourceElement.closest<HTMLElement>('[data-testid="message_content"]') ?? sourceElement

    const fallbackId = `msg-${index + 1}`
    let id = element.dataset.messageId?.trim() ?? fallbackId
    if (seen.has(id)) {
      id = `${id}-${index + 1}`
    }
    if (seen.has(id)) {
      continue
    }

    const textElement = messageTextSelectorCandidates.reduce<HTMLElement | null>(
      (acc, selector) => acc ?? element.querySelector<HTMLElement>(selector),
      null
    )
    const text = normalizeText((textElement ?? element).textContent ?? "")
    if (!text) {
      continue
    }

    nextNodes.push({
      id,
      role: element.closest('[data-testid="send_message"]') ? "user" : "assistant",
      text,
      element
    })
    seen.add(id)
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
