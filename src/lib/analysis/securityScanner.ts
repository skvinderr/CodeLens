import type { SecurityFinding } from '@/types'

export interface SecurityScannerOptions {
  includeDependencies?: boolean
}

export function scanForSecurityIssues(
  filePath: string,
  fileContent: string,
  options: SecurityScannerOptions = {},
): SecurityFinding[] {
  void filePath
  void fileContent
  void options
  return []
}
