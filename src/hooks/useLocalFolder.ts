import { useMemo } from 'react'

export interface LocalFolderState {
  directoryHandle: FileSystemDirectoryHandle | null
  isSupported: boolean
  openFolder: () => Promise<void>
}

export function useLocalFolder(): LocalFolderState {
  return useMemo(
    () => ({
      directoryHandle: null,
      isSupported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
      openFolder: async () => undefined,
    }),
    [],
  )
}
