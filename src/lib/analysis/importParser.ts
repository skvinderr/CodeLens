export interface ImportReference {
  source: string
  specifiers: string[]
  isTypeOnly: boolean
}

export function parseImports(fileContent: string): ImportReference[] {
  void fileContent
  return []
}
