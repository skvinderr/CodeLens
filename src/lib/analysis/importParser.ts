export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'css'
  | 'scss'
  | 'unknown'

export interface ParsedImportEntry {
  path: string
  type: 'static' | 'dynamic' | 'type-only' | 'side-effect'
  names: string[]
}

export interface ParsedExportEntry {
  name: string
  isDefault: boolean
}

export interface ParsedImports {
  imports: ParsedImportEntry[]
  exports: ParsedExportEntry[]
  language: Language
  lineCount: number
}

function detectLanguage(filePath: string, content: string): Language {
  const lowerPath = filePath.toLowerCase()

  if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) {
    return 'typescript'
  }
  if (
    lowerPath.endsWith('.js') ||
    lowerPath.endsWith('.jsx') ||
    lowerPath.endsWith('.mjs') ||
    lowerPath.endsWith('.cjs')
  ) {
    return 'javascript'
  }
  if (lowerPath.endsWith('.py')) {
    return 'python'
  }
  if (lowerPath.endsWith('.scss') || lowerPath.endsWith('.sass')) {
    return 'scss'
  }
  if (lowerPath.endsWith('.css')) {
    return 'css'
  }

  if (/^\s*(from\s+[\.\w]+\s+import|import\s+[\w\.]+)/m.test(content)) {
    return 'python'
  }
  if (/^\s*@import\s+/m.test(content)) {
    return 'css'
  }
  if (/\b(import|export)\b|require\(/.test(content)) {
    return 'javascript'
  }

  return 'unknown'
}

function normalizeNamedSpecifier(name: string): string {
  const trimmed = name.trim().replace(/^type\s+/, '')
  if (!trimmed) {
    return ''
  }

  const aliasParts = trimmed.split(/\s+as\s+/i)
  return aliasParts[aliasParts.length - 1].trim()
}

function parseNamedList(raw: string): string[] {
  return raw
    .replace(/[{}()]/g, '')
    .split(',')
    .map(normalizeNamedSpecifier)
    .filter(Boolean)
}

function parseImportClause(clause: string): string[] {
  const cleaned = clause.trim()
  if (!cleaned) {
    return []
  }

  const names: string[] = []

  const namespaceMatch = cleaned.match(/^\*\s+as\s+([\w$]+)/)
  if (namespaceMatch) {
    return [namespaceMatch[1]]
  }

  const parts = cleaned.split(',').map((part) => part.trim())
  for (const part of parts) {
    if (!part) {
      continue
    }

    if (part.startsWith('{') && part.endsWith('}')) {
      names.push(...parseNamedList(part))
      continue
    }

    if (part.startsWith('{')) {
      names.push(...parseNamedList(part))
      continue
    }

    const normalized = normalizeNamedSpecifier(part)
    if (normalized) {
      names.push(normalized)
    }
  }

  return names
}

function parseJsTs(
  content: string,
  parsedImports: ParsedImportEntry[],
  parsedExports: ParsedExportEntry[],
): void {
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const importFromMatch = trimmed.match(
      /^import\s+(type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"];?$/,
    )
    if (importFromMatch) {
      const isTypeOnly = Boolean(importFromMatch[1])
      parsedImports.push({
        path: importFromMatch[3],
        type: isTypeOnly ? 'type-only' : 'static',
        names: parseImportClause(importFromMatch[2]),
      })
      continue
    }

    const sideEffectImportMatch = trimmed.match(/^import\s+['"]([^'"]+)['"];?$/)
    if (sideEffectImportMatch) {
      parsedImports.push({
        path: sideEffectImportMatch[1],
        type: 'side-effect',
        names: [],
      })
      continue
    }

    const exportFromMatch = trimmed.match(
      /^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?$/,
    )
    if (exportFromMatch) {
      const names = parseNamedList(exportFromMatch[1])
      parsedImports.push({
        path: exportFromMatch[2],
        type: 'static',
        names,
      })

      for (const name of names) {
        parsedExports.push({ name, isDefault: false })
      }
      continue
    }

    const exportListMatch = trimmed.match(/^export\s+\{([^}]+)\}\s*;?$/)
    if (exportListMatch) {
      const names = parseNamedList(exportListMatch[1])
      for (const name of names) {
        parsedExports.push({ name, isDefault: false })
      }
      continue
    }

    const exportDefaultMatch = trimmed.match(
      /^export\s+default(?:\s+(?:class|function))?\s*([\w$]+)?/,
    )
    if (exportDefaultMatch) {
      parsedExports.push({
        name: exportDefaultMatch[1] || 'default',
        isDefault: true,
      })
      continue
    }

    const exportDeclMatch = trimmed.match(
      /^export\s+(?:const|let|var|function|class|interface|type|enum)\s+([\w$]+)/,
    )
    if (exportDeclMatch) {
      parsedExports.push({ name: exportDeclMatch[1], isDefault: false })
    }

    const requireMatch = trimmed.match(
      /^(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/,
    )
    if (requireMatch) {
      parsedImports.push({
        path: requireMatch[2],
        type: 'static',
        names: [requireMatch[1]],
      })
    }
  }

  const dynamicStringImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of content.matchAll(dynamicStringImportRegex)) {
    parsedImports.push({ path: match[1], type: 'dynamic', names: [] })
  }

  const dynamicTemplateImportRegex = /import\(\s*`([^`]+)`\s*\)/g
  for (const match of content.matchAll(dynamicTemplateImportRegex)) {
    parsedImports.push({ path: match[1], type: 'dynamic', names: [] })
  }
}

function parsePython(content: string, parsedImports: ParsedImportEntry[]): void {
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const importMatch = trimmed.match(/^import\s+(.+)$/)
    if (importMatch) {
      const modules = importMatch[1]
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)

      for (const moduleSpec of modules) {
        const aliasParts = moduleSpec.split(/\s+as\s+/i)
        const modulePath = aliasParts[0].trim()
        const localName = (aliasParts[1] ?? modulePath.split('.').pop() ?? modulePath).trim()

        parsedImports.push({
          path: modulePath,
          type: 'static',
          names: [localName],
        })
      }

      continue
    }

    const fromImportMatch = trimmed.match(/^from\s+([\.\w]+)\s+import\s+(.+)$/)
    if (fromImportMatch) {
      const modulePath = fromImportMatch[1].trim()
      const names = fromImportMatch[2].trim() === '*' ? ['*'] : parseNamedList(fromImportMatch[2])

      parsedImports.push({
        path: modulePath,
        type: 'static',
        names,
      })
    }
  }
}

function parseCss(content: string, parsedImports: ParsedImportEntry[]): void {
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const importStringMatch = trimmed.match(/^@import\s+['"]([^'"]+)['"]\s*;?$/i)
    if (importStringMatch) {
      parsedImports.push({
        path: importStringMatch[1],
        type: 'side-effect',
        names: [],
      })
      continue
    }

    const importUrlMatch = trimmed.match(
      /^@import\s+url\(\s*['"]?([^'"\)]+)['"]?\s*\)\s*;?$/i,
    )
    if (importUrlMatch) {
      parsedImports.push({
        path: importUrlMatch[1],
        type: 'side-effect',
        names: [],
      })
    }
  }
}

export function parseImports(content: string, filePath: string): ParsedImports {
  const language = detectLanguage(filePath, content)
  const imports: ParsedImportEntry[] = []
  const exports: ParsedExportEntry[] = []

  if (language === 'javascript' || language === 'typescript' || language === 'unknown') {
    parseJsTs(content, imports, exports)
  }

  if (language === 'python') {
    parsePython(content, imports)
  }

  if (language === 'css' || language === 'scss') {
    parseCss(content, imports)
  }

  const dedupedImportMap = new Map<string, ParsedImportEntry>()
  for (const entry of imports) {
    const key = `${entry.type}:${entry.path}:${entry.names.join(',')}`
    if (!dedupedImportMap.has(key)) {
      dedupedImportMap.set(key, entry)
    }
  }

  const dedupedExportMap = new Map<string, ParsedExportEntry>()
  for (const entry of exports) {
    const key = `${entry.isDefault ? 'd' : 'n'}:${entry.name}`
    if (!dedupedExportMap.has(key)) {
      dedupedExportMap.set(key, entry)
    }
  }

  return {
    imports: [...dedupedImportMap.values()],
    exports: [...dedupedExportMap.values()],
    language,
    lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
  }
}
