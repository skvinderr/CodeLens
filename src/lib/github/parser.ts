import type { CodeLensFileNode } from '@/types'
import type { RepositoryTreeEntry } from '@/lib/github/fetcher'

export interface ParseGitHubTreeOptions {
  repositoryRoot?: string
}

export function parseGitHubTree(
  entries: RepositoryTreeEntry[],
  options: ParseGitHubTreeOptions = {},
): CodeLensFileNode[] {
  const root = options.repositoryRoot?.replace(/\\/g, '/').replace(/\/+$/, '') ?? ''

  interface MutableNode extends CodeLensFileNode {
    children?: MutableNode[]
  }

  const nodeMap = new Map<string, MutableNode>()
  const topLevel: MutableNode[] = []

  const ensureDirectory = (path: string): MutableNode | null => {
    const normalized = path.replace(/\\/g, '/').replace(/^\.?\//, '')
    if (!normalized) {
      return null
    }

    const existing = nodeMap.get(normalized)
    if (existing) {
      return existing
    }

    const segments = normalized.split('/')
    const name = segments[segments.length - 1] ?? normalized
    const parentPath = segments.slice(0, -1).join('/')
    const directory: MutableNode = {
      id: `dir:${normalized}`,
      name,
      path: normalized,
      type: 'directory',
      children: [],
    }

    nodeMap.set(normalized, directory)
    const parent = ensureDirectory(parentPath)
    if (parent) {
      parent.children = parent.children ?? []
      if (!parent.children.some((child) => child.path === normalized)) {
        parent.children.push(directory)
      }
    } else if (!topLevel.some((node) => node.path === normalized)) {
      topLevel.push(directory)
    }

    return directory
  }

  for (const entry of entries) {
    if (entry.type !== 'blob') {
      continue
    }

    const relativePath = entry.path
      .replace(/\\/g, '/')
      .replace(root ? new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`) : /^$/, '')
      .replace(/^\.?\//, '')

    const segments = relativePath.split('/').filter(Boolean)
    if (segments.length === 0) {
      continue
    }

    const fileName = segments[segments.length - 1]
    const directoryPath = segments.slice(0, -1).join('/')
    const extension = fileName.includes('.') ? fileName.split('.').pop() : ''

    const fileNode: MutableNode = {
      id: `file:${relativePath}`,
      name: fileName,
      path: relativePath,
      type: 'file',
      extension,
      size: entry.size,
    }

    const parent = ensureDirectory(directoryPath)
    if (parent) {
      parent.children = parent.children ?? []
      parent.children.push(fileNode)
    } else {
      topLevel.push(fileNode)
    }
  }

  const sortTree = (nodes: MutableNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }

      return left.path.localeCompare(right.path)
    })

    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        sortTree(node.children)
      }
    }
  }

  sortTree(topLevel)
  return topLevel
}
