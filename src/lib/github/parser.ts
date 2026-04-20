import type { CodeLensFileNode } from '@/types'
import type { RepositoryTreeEntry } from '@/lib/github/fetcher'

export interface ParseGitHubTreeOptions {
  repositoryRoot?: string
}

export function parseGitHubTree(
  entries: RepositoryTreeEntry[],
  options: ParseGitHubTreeOptions = {},
): CodeLensFileNode[] {
  void entries
  void options
  return []
}
