import type { CodeLensFileNode, FileNode, GraphData, GraphLink, GraphNode } from '@/types'

export interface BuildGraphOptions {
  includeExternal?: boolean
}

const DEFAULT_EXTENSION_CANDIDATES = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'css',
  'scss',
  'sass',
  'json',
]

function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

function normalizePath(path: string): string {
  const normalized = toPosix(path).replace(/^\.\//, '')
  const segments = normalized.split('/')
  const stack: string[] = []

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      stack.pop()
      continue
    }

    stack.push(segment)
  }

  return stack.join('/')
}

function getDirectory(path: string): string {
  const normalized = normalizePath(path)
  const slashIndex = normalized.lastIndexOf('/')
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : ''
}

function hasFileExtension(path: string): boolean {
  const fileName = path.split('/').pop() ?? path
  return fileName.includes('.')
}

function joinPath(base: string, target: string): string {
  return normalizePath([base, target].filter(Boolean).join('/'))
}

function getTopLevelGroup(path: string): string {
  const normalized = normalizePath(path)
  const segments = normalized.split('/')
  if (segments.length <= 1) {
    return 'root'
  }
  return segments[0]
}

function flattenCodeLensFiles(nodes: CodeLensFileNode[]): CodeLensFileNode[] {
  const flattened: CodeLensFileNode[] = []

  for (const node of nodes) {
    if (node.type === 'file') {
      flattened.push(node)
      continue
    }

    if (node.children && node.children.length > 0) {
      flattened.push(...flattenCodeLensFiles(node.children))
    }
  }

  return flattened
}

function resolvePathCandidates(
  candidateBase: string,
  fileMap: Map<string, FileNode>,
  extensionCandidates: string[],
): string | null {
  const normalizedBase = normalizePath(candidateBase)

  if (fileMap.has(normalizedBase)) {
    return normalizedBase
  }

  if (!hasFileExtension(normalizedBase)) {
    for (const extension of extensionCandidates) {
      const withExt = `${normalizedBase}.${extension}`
      if (fileMap.has(withExt)) {
        return withExt
      }
    }
  }

  for (const extension of extensionCandidates) {
    const indexPath = `${normalizedBase}/index.${extension}`
    if (fileMap.has(indexPath)) {
      return indexPath
    }
  }

  return null
}

function resolveRelativeImportPath(
  importerPath: string,
  importPath: string,
  fileMap: Map<string, FileNode>,
  extensionCandidates: string[],
): string | null {
  const sanitizedImportPath = toPosix(importPath).split('?')[0].split('#')[0]

  if (!sanitizedImportPath.startsWith('.')) {
    return null
  }

  const importerDir = getDirectory(importerPath)

  // Python relative style: .relative, ..parent.module
  if (!sanitizedImportPath.includes('/')) {
    const leadingDotsMatch = sanitizedImportPath.match(/^\.+/)
    const leadingDots = leadingDotsMatch ? leadingDotsMatch[0].length : 0
    const moduleSuffix = sanitizedImportPath
      .slice(leadingDots)
      .replace(/\./g, '/')

    const relativePrefix =
      leadingDots <= 1 ? '.' : Array.from({ length: leadingDots - 1 }, () => '..').join('/')
    const pythonCandidate = joinPath(
      importerDir,
      [relativePrefix, moduleSuffix].filter(Boolean).join('/'),
    )

    return resolvePathCandidates(pythonCandidate, fileMap, extensionCandidates)
  }

  const candidateBase = joinPath(importerDir, sanitizedImportPath)
  return resolvePathCandidates(candidateBase, fileMap, extensionCandidates)
}

function inferLinkType(importPath: string, resolvedPath: string): GraphLink['type'] {
  const lowerImportPath = importPath.toLowerCase()
  const lowerResolvedPath = resolvedPath.toLowerCase()

  if (lowerImportPath.includes('${')) {
    return 'dynamic'
  }

  if (lowerResolvedPath.endsWith('.css') || lowerResolvedPath.endsWith('.scss') || lowerResolvedPath.endsWith('.sass')) {
    return 'css'
  }

  if (lowerImportPath.startsWith('re-export:')) {
    return 're-export'
  }

  return 'import'
}

export function buildDependencyGraph(files: FileNode[]): GraphData {
  const normalizedFiles = files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
  }))

  // Efficient path lookup for dependency resolution.
  const fileMap = new Map<string, FileNode>()
  for (const file of normalizedFiles) {
    fileMap.set(file.path, file)
  }

  const extensionCandidates = Array.from(
    new Set([
      ...DEFAULT_EXTENSION_CANDIDATES,
      ...normalizedFiles
        .map((file) => {
          const fileName = file.path.split('/').pop() ?? file.path
          const extension = fileName.includes('.') ? fileName.split('.').pop() : ''
          return extension ?? ''
        })
        .filter(Boolean),
    ]),
  )

  const linkWeightMap = new Map<string, GraphLink>()

  for (const file of normalizedFiles) {
    for (const importPath of file.imports) {
      const resolvedPath = resolveRelativeImportPath(
        file.path,
        importPath,
        fileMap,
        extensionCandidates,
      )

      if (!resolvedPath || !fileMap.has(resolvedPath)) {
        continue
      }

      const linkType = inferLinkType(importPath, resolvedPath)
      const linkKey = `${file.path}::${resolvedPath}::${linkType}`
      const existingLink = linkWeightMap.get(linkKey)

      if (existingLink) {
        existingLink.weight += 1
        continue
      }

      linkWeightMap.set(linkKey, {
        source: file.path,
        target: resolvedPath,
        type: linkType,
        weight: 1,
      })
    }
  }

  const links = [...linkWeightMap.values()]
  const degreeMap = new Map<string, number>()

  for (const file of normalizedFiles) {
    degreeMap.set(file.path, 0)
  }

  for (const link of links) {
    degreeMap.set(link.source, (degreeMap.get(link.source) ?? 0) + 1)
    degreeMap.set(link.target, (degreeMap.get(link.target) ?? 0) + 1)
  }

  const nodes: GraphNode[] = normalizedFiles.map((file) => {
    const degree = degreeMap.get(file.path) ?? 0
    return {
      ...file,
      group: getTopLevelGroup(file.path),
      blastScore: 0,
      isCircularDep: false,
      degree,
      isOrphan: degree === 0,
      label: file.name,
      filePath: file.path,
    }
  })

  return {
    nodes,
    links,
    edges: links,
  }
}

export function buildGraphFromFiles(
  files: CodeLensFileNode[],
  options: BuildGraphOptions = {},
): GraphData {
  const flattenedFiles = flattenCodeLensFiles(files)
  const fileNodes: FileNode[] = flattenedFiles.map((file) => {
    const normalizedPath = normalizePath(file.path)
    const fileName = normalizedPath.split('/').pop() ?? file.name
    const extension =
      file.extension ?? (fileName.includes('.') ? fileName.split('.').pop() ?? '' : '')

    return {
      id: file.id,
      path: normalizedPath,
      name: fileName,
      extension,
      language: extension,
      size: file.size ?? 0,
      imports: [],
      exports: [],
      lineCount: 0,
    }
  })

  const graph = buildDependencyGraph(fileNodes)
  if (!options.includeExternal) {
    return graph
  }

  return graph
}
