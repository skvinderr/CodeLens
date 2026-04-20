import type { CodeLensFileNode } from '@/types'

export interface FolderReadOptions {
  includeHidden?: boolean
}

export async function readLocalFolder(
  directory: FileSystemDirectoryHandle,
  options: FolderReadOptions = {},
): Promise<CodeLensFileNode[]> {
  void directory
  void options
  return []
}
