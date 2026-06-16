<script setup lang="ts">
import SiteTimeline from "../SiteTimeline.vue"

type CollectedNode = {
  id: string
  role: "user" | "assistant"
  text: string
  element: HTMLElement
}

const itemSelectorCandidates = [
  ".chat-content-list .chat-content-item",
  ".chat-detail-content .chat-content-item",
  ".chat-content-item"
]

const textSelectorCandidates = [".user-content", ".markdown", ".markdown-container"]

const normalizeText = (raw: string) => raw.replace(/\s+/g, " ").trim()

const collectCandidateElements = () => {
  const seen = new Set<HTMLElement>()
  const result: HTMLElement[] = []

  for (const selector of itemSelectorCandidates) {
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

  for (let index = 0; index < messageElements.length; index += 1) {
    const element = messageElements[index]
    const textElement = textSelectorCandidates.reduce<HTMLElement | null>(
      (acc, selector) => acc ?? element.querySelector<HTMLElement>(selector),
      null
    )
    const text = normalizeText((textElement ?? element).textContent ?? "")
    if (!text) {
      continue
    }

    nextNodes.push({
      id: `kimi-msg-${index + 1}`,
      role: element.classList.contains("chat-content-item-user") ? "user" : "assistant",
      text,
      element
    })
  }

  return nextNodes
}
</script>

<template>
  <SiteTimeline
    site-id="kimi"
    highlight-class-name="kimi-timeline-target"
    :collect-nodes="collectNodes" />
</template>
