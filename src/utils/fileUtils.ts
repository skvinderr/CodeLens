export function getFileExtension(filePath: string): string {
  const segments = filePath.split('.')
  return segments.length > 1 ? segments[segments.length - 1] : ''
}

export function isCodeFile(filePath: string): boolean {
  const extension = getFileExtension(filePath).toLowerCase()
  return ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs'].includes(extension)
}
