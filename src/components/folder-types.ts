export type FolderConversation = {
  id: string
  title: string
  href: string
  starred: boolean
}

export type FolderNode = {
  id: string
  name: string
  color: string
  pinned: boolean
  expanded: boolean
  children: FolderNode[]
  conversations: FolderConversation[]
}
