export type FolderNode = {
  id: string
  name: string
  color: string
  pinned: boolean
  expanded: boolean
  children: FolderNode[]
}
