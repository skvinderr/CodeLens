import type {
  AnalysisResult,
  FileNode,
  HealthCategories,
  HealthFinding,
  HealthGrade,
  HealthImprovement,
  HealthScore,
} from '@/types'

export interface HealthInput {
  complexityAverage: number
  vulnerabilityCount: number
  staleDependencies: number
  testCoverage: number
}

const CATEGORY_WEIGHTS = {
  security: 0.25,
  dependencies: 0.2,
  complexity: 0.2,
  documentation: 0.15,
  testCoverage: 0.1,
  codeSmells: 0.1,
} as const

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'java',
  'cs',
  'php',
  'rs',
  'swift',
  'kt',
  'kts',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'scss',
  'css',
])

const LOCK_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
  'pipfile.lock',
  'poetry.lock',
  'uv.lock',
])

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

function fileName(path: string): string {
  const normalized = toPosix(path)
  const segments = normalized.split('/')
  return segments[segments.length - 1] || normalized
}

function extension(path: string): string {
  const name = fileName(path)
  if (!name.includes('.')) {
    return ''
  }

  return name.split('.').pop()?.toLowerCase() ?? ''
}

function isTestFile(path: string): boolean {
  const normalized = toPosix(path).toLowerCase()
  return /(?:^|\/)(__tests__|tests)\//.test(normalized) || /\.(test|spec)\./.test(normalized)
}

function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.has(extension(path))
}

function lineCount(file: FileNode): number {
  if (typeof file.lineCount === 'number' && file.lineCount > 0) {
    return file.lineCount
  }

  if (typeof file.content === 'string') {
    if (file.content.length === 0) {
      return 0
    }

    return file.content.split(/\r?\n/).length
  }

  return Math.max(1, Math.round((file.size ?? 0) / 42))
}

function findFile(files: FileNode[], matcher: (name: string, path: string) => boolean): FileNode | null {
  for (const file of files) {
    const name = fileName(file.path).toLowerCase()
    const path = toPosix(file.path).toLowerCase()

    if (matcher(name, path)) {
      return file
    }
  }

  return null
}

function countWords(content: string): number {
  return content
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function scoreColorGrade(value: number): HealthGrade {
  if (value >= 90) {
    return 'A'
  }
  if (value >= 75) {
    return 'B'
  }
  if (value >= 60) {
    return 'C'
  }
  if (value >= 45) {
    return 'D'
  }
  return 'F'
}

function computeInlineCommentRatio(files: FileNode[]): number {
  let totalNonEmpty = 0
  let commentLines = 0

  for (const file of files) {
    if (!isCodeFile(file.path) || typeof file.content !== 'string') {
      continue
    }

    const lines = file.content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      totalNonEmpty += 1
      if (/^(\/\/|#|\/\*|\*|<!--|-->|;)/.test(trimmed)) {
        commentLines += 1
      }
    }
  }

  if (totalNonEmpty === 0) {
    return 0
  }

  return commentLines / totalNonEmpty
}

function functionDocumentationRatio(files: FileNode[]): number {
  let functions = 0
  let documented = 0

  for (const file of files) {
    if (!isCodeFile(file.path) || typeof file.content !== 'string') {
      continue
    }

    const lines = file.content.split(/\r?\n/)

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const isFunctionLike =
        /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/.test(line) ||
        /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(line) ||
        /^\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(line) ||
        /^\s*def\s+[A-Za-z_][\w]*\s*\(.*\)\s*:/.test(line)

      if (!isFunctionLike) {
        continue
      }

      functions += 1

      const previousWindow = lines
        .slice(Math.max(0, index - 3), index)
        .join('\n')
      const hasJsDoc = /\/\*\*|^\s*\/\/\//m.test(previousWindow)

      let hasDocString = false
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex].trim()
        if (!nextLine) {
          continue
        }

        hasDocString = /^(["']{3})/.test(nextLine)
        break
      }

      if (hasJsDoc || hasDocString) {
        documented += 1
      }
    }
  }

  if (functions === 0) {
    return 0
  }

  return documented / functions
}

function hasMixedLineEndings(files: FileNode[]): boolean {
  let hasCrlf = false
  let hasLf = false

  for (const file of files) {
    if (typeof file.content !== 'string' || file.content.length === 0) {
      continue
    }

    const content = file.content
    const fileHasCrlf = /\r\n/.test(content)
    const fileHasLfOnly = /(^|[^\r])\n/.test(content)

    if (fileHasCrlf && fileHasLfOnly) {
      return true
    }

    hasCrlf = hasCrlf || fileHasCrlf
    hasLf = hasLf || fileHasLfOnly
  }

  return hasCrlf && hasLf
}

export function computeHealthScore(result: AnalysisResult): HealthScore {
  const files = result.files
  const graphLinks = result.graph.links.length > 0 ? result.graph.links : result.graph.edges

  const breakdown: HealthFinding[] = []
  const improvementCandidates: HealthImprovement[] = []

  const addFinding = (
    category: keyof HealthCategories,
    message: string,
    points: number,
    affectedFiles: string[] = [],
    improvementMessage?: string,
  ) => {
    if (points === 0) {
      return
    }

    breakdown.push({
      category,
      message,
      points,
      affectedFiles,
    })

    if (points < 0 && improvementMessage) {
      improvementCandidates.push({
        category,
        message: improvementMessage,
        estimatedGain: Math.abs(points),
      })
    }
  }

  // 1) SECURITY (25%)
  let securityScore = 100
  const criticalAlerts = result.security.filter((alert) => alert.severity === 'critical')
  const highAlerts = result.security.filter((alert) => alert.severity === 'high')
  const mediumAlerts = result.security.filter((alert) => alert.severity === 'medium')
  const lowAlerts = result.security.filter((alert) => alert.severity === 'low')

  if (criticalAlerts.length > 0) {
    const points = criticalAlerts.length * 20
    securityScore -= points
    addFinding(
      'security',
      `${criticalAlerts.length} critical security alerts detected`,
      -points,
      [...new Set(criticalAlerts.map((alert) => alert.filePath))],
      'Rotate exposed secrets and block commits containing credentials.',
    )
  }

  if (highAlerts.length > 0) {
    const points = highAlerts.length * 10
    securityScore -= points
    addFinding(
      'security',
      `${highAlerts.length} high-severity security alerts detected`,
      -points,
      [...new Set(highAlerts.map((alert) => alert.filePath))],
      'Move sensitive values to secret management and sanitize unsafe patterns.',
    )
  }

  if (mediumAlerts.length > 0) {
    const points = mediumAlerts.length * 3
    securityScore -= points
    addFinding(
      'security',
      `${mediumAlerts.length} medium-severity security alerts detected`,
      -points,
      [...new Set(mediumAlerts.map((alert) => alert.filePath))],
      'Address medium-severity findings before the next release cycle.',
    )
  }

  if (lowAlerts.length > 0) {
    const points = lowAlerts.length
    securityScore -= points
    addFinding(
      'security',
      `${lowAlerts.length} low-severity security alerts detected`,
      -points,
      [...new Set(lowAlerts.map((alert) => alert.filePath))],
      'Clean low-severity warnings to keep the baseline secure and maintainable.',
    )
  }

  securityScore = clamp(Math.round(securityScore), 0, 100)

  // 2) DEPENDENCIES (20%)
  let dependencyScore = 100

  const cycleCount = result.circularDeps.length
  if (cycleCount > 0) {
    const points = cycleCount * 15
    dependencyScore -= points
    addFinding(
      'dependencies',
      `${cycleCount} circular dependency cycles detected`,
      -points,
      result.circularDeps.flat().slice(0, 20),
      'Break circular imports by extracting shared abstractions or introducing interfaces.',
    )
  }

  const totalNodes = result.graph.nodes.length
  const orphanFiles = result.graph.nodes.filter((node) => node.isOrphan || node.degree === 0)
  const orphanRatio = totalNodes === 0 ? 0 : orphanFiles.length / totalNodes
  if (orphanRatio > 0.15) {
    dependencyScore -= 10
    addFinding(
      'dependencies',
      `Orphan file ratio is ${(orphanRatio * 100).toFixed(1)}%`,
      -10,
      orphanFiles.map((node) => node.path),
      'Remove dead files or integrate isolated modules into active dependency paths.',
    )
  }

  const outgoingBySource = new Map<string, number>()
  for (const link of graphLinks) {
    outgoingBySource.set(
      link.source,
      (outgoingBySource.get(link.source) ?? 0) + (link.weight ?? 1),
    )
  }
  const averageFanOut =
    totalNodes === 0
      ? 0
      : [...outgoingBySource.values()].reduce((sum, value) => sum + value, 0) / totalNodes

  if (averageFanOut > 20) {
    dependencyScore -= 8
    addFinding(
      'dependencies',
      `Average fan-out is ${averageFanOut.toFixed(1)} per file`,
      -8,
      [...outgoingBySource.entries()]
        .filter(([, count]) => count > 20)
        .map(([path]) => path)
        .slice(0, 20),
      'Reduce import fan-out by splitting modules and introducing focused interfaces.',
    )
  }

  const hasManifest = Boolean(
    findFile(files, (name) => name === 'package.json' || /^requirements.*\.txt$/i.test(name)),
  )
  if (!hasManifest) {
    dependencyScore -= 10
    addFinding(
      'dependencies',
      'No package manifest detected (package.json / requirements*.txt)',
      -10,
      [],
      'Add and maintain dependency manifests to track versions and security updates.',
    )
  }

  const lockfile = findFile(files, (name) => LOCK_FILES.has(name))
  if (lockfile) {
    dependencyScore += 5
    addFinding(
      'dependencies',
      'Lockfile detected for deterministic dependency installs',
      5,
      [lockfile.path],
    )
  }

  dependencyScore = clamp(Math.round(dependencyScore), 0, 100)

  // 3) COMPLEXITY (20%)
  let complexityScore = 100
  const complexityFiles = files.filter((file) => isCodeFile(file.path))
  const complexityTargets = complexityFiles.length > 0 ? complexityFiles : files
  const lineCounts = complexityTargets.map((file) => ({
    path: file.path,
    lines: lineCount(file),
    content: file.content ?? '',
  }))

  const averageLines =
    lineCounts.length === 0
      ? 0
      : lineCounts.reduce((sum, file) => sum + file.lines, 0) / lineCounts.length

  if (averageLines > 500) {
    complexityScore -= 20
    addFinding(
      'complexity',
      `Average file size is ${averageLines.toFixed(0)} lines`,
      -20,
      [],
      'Split large files into smaller focused modules to reduce cognitive load.',
    )
  } else if (averageLines > 300) {
    complexityScore -= 10
    addFinding(
      'complexity',
      `Average file size is ${averageLines.toFixed(0)} lines`,
      -10,
      [],
      'Refactor oversized files before they exceed maintainability limits.',
    )
  }

  const oversizedFiles = lineCounts.filter((file) => file.lines > 1000)
  if (oversizedFiles.length > 0) {
    const points = Math.min(oversizedFiles.length * 5, 25)
    complexityScore -= points
    addFinding(
      'complexity',
      `${oversizedFiles.length} files exceed 1000 lines`,
      -points,
      oversizedFiles.map((file) => file.path).slice(0, 20),
      'Break very large files into composable modules and utility layers.',
    )
  }

  const deepNestFiles: string[] = []
  for (const file of complexityTargets) {
    if (typeof file.content !== 'string' || file.content.length === 0) {
      continue
    }

    const lines = file.content.split(/\r?\n/)
    const nonEmpty = lines.filter((line) => line.trim().length > 0)
    if (nonEmpty.length === 0) {
      continue
    }

    const deepCount = nonEmpty.filter((line) => /^(( {4}){4,}|\t{4,})\S/.test(line)).length
    const ratio = deepCount / nonEmpty.length
    if (ratio > 0.2) {
      deepNestFiles.push(file.path)
    }
  }

  if (deepNestFiles.length > 0) {
    complexityScore -= 10
    addFinding(
      'complexity',
      'Deep nesting exceeds 20% of lines in at least one file',
      -10,
      deepNestFiles,
      'Flatten nested logic with guard clauses and smaller helper functions.',
    )
  }

  complexityScore = clamp(Math.round(complexityScore), 0, 100)

  // 4) DOCUMENTATION (15%)
  let documentationScore = 0

  const readme = findFile(files, (name) => name === 'readme.md')
  if (readme) {
    documentationScore += 20
    addFinding('documentation', 'README.md detected', 20, [readme.path])

    const wordCount = typeof readme.content === 'string' ? countWords(readme.content) : 0
    if (wordCount > 500) {
      documentationScore += 15
      addFinding('documentation', `README length is ${wordCount} words`, 15, [readme.path])
    } else if (wordCount > 200) {
      documentationScore += 8
      addFinding('documentation', `README length is ${wordCount} words`, 8, [readme.path])
    }
  }

  const contributing = findFile(files, (name) => name === 'contributing.md')
  if (contributing) {
    documentationScore += 15
    addFinding('documentation', 'CONTRIBUTING.md detected', 15, [contributing.path])
  }

  const changelog = findFile(files, (name) => name === 'changelog.md' || name.startsWith('history'))
  if (changelog) {
    documentationScore += 10
    addFinding('documentation', 'CHANGELOG/HISTORY file detected', 10, [changelog.path])
  }

  const license = findFile(files, (name) => name === 'license' || name === 'license.md')
  if (license) {
    documentationScore += 10
    addFinding('documentation', 'LICENSE file detected', 10, [license.path])
  }

  const commentRatio = computeInlineCommentRatio(files)
  if (commentRatio > 0.1) {
    documentationScore += 15
    addFinding(
      'documentation',
      `Inline comment ratio is ${(commentRatio * 100).toFixed(1)}%`,
      15,
      [],
    )
  }

  const docRatio = functionDocumentationRatio(files)
  if (docRatio > 0.3) {
    documentationScore += 15
    addFinding(
      'documentation',
      `Function doc coverage is ${(docRatio * 100).toFixed(1)}%`,
      15,
      [],
    )
  }

  documentationScore = clamp(Math.round(documentationScore), 0, 100)

  // 5) TEST COVERAGE (10%)
  let testCoverageScore = 0

  const codeFiles = files.filter((file) => isCodeFile(file.path) && !isTestFile(file.path))
  const testFiles = files.filter((file) => isTestFile(file.path))
  const testRatio = codeFiles.length === 0 ? 0 : testFiles.length / codeFiles.length

  if (testRatio >= 0.5) {
    testCoverageScore += 40
    addFinding('testCoverage', `Test file ratio is ${testRatio.toFixed(2)}`, 40)
  } else if (testRatio >= 0.3) {
    testCoverageScore += 25
    addFinding('testCoverage', `Test file ratio is ${testRatio.toFixed(2)}`, 25)
  } else if (testRatio >= 0.1) {
    testCoverageScore += 10
    addFinding('testCoverage', `Test file ratio is ${testRatio.toFixed(2)}`, 10)
  } else if (testRatio > 0) {
    testCoverageScore += 5
    addFinding('testCoverage', `Test file ratio is ${testRatio.toFixed(2)}`, 5)
  }

  const hasTestConfig = Boolean(
    findFile(
      files,
      (name) =>
        name.startsWith('jest.config') ||
        name.startsWith('vitest.config') ||
        name === 'pytest.ini',
    ),
  )
  if (hasTestConfig) {
    testCoverageScore += 20
    addFinding('testCoverage', 'Test framework config file detected', 20)
  }

  const hasCiConfig = Boolean(
    findFile(
      files,
      (name, path) => name === '.travis.yml' || path.startsWith('.github/workflows/'),
    ),
  )
  if (hasCiConfig) {
    testCoverageScore += 25
    addFinding('testCoverage', 'CI workflow detected', 25)
  }

  const hasCoverageConfig = Boolean(
    findFile(
      files,
      (name) =>
        name === '.nycrc' ||
        name.startsWith('.nycrc.') ||
        name === '.c8rc' ||
        name.startsWith('c8.config') ||
        name === 'nyc.config.js',
    ) ||
      files.some(
        (file) =>
          fileName(file.path).toLowerCase() === 'package.json' &&
          typeof file.content === 'string' &&
          /"(nyc|c8)"\s*:/.test(file.content),
      ),
  )

  if (hasCoverageConfig) {
    testCoverageScore += 15
    addFinding('testCoverage', 'Coverage tooling config detected (nyc/c8)', 15)
  }

  testCoverageScore = clamp(Math.round(testCoverageScore), 0, 100)

  // 6) CODE HEALTH (10%)
  let codeHealthScore = 100

  let todoFixmeCount = 0
  let hasDebugger = false
  const debuggerFiles: string[] = []

  for (const file of files) {
    if (typeof file.content !== 'string') {
      continue
    }

    const todoMatches = file.content.match(/\b(TODO|FIXME)\b/gi)
    todoFixmeCount += todoMatches?.length ?? 0

    if (/\bdebugger\b/.test(file.content)) {
      hasDebugger = true
      debuggerFiles.push(file.path)
    }
  }

  if (todoFixmeCount > 50) {
    codeHealthScore -= 20
    addFinding(
      'codeSmells',
      `${todoFixmeCount} TODO/FIXME markers detected`,
      -20,
      [],
      'Close stale TODO/FIXME items and convert the rest into tracked work items.',
    )
  } else if (todoFixmeCount > 20) {
    codeHealthScore -= 10
    addFinding(
      'codeSmells',
      `${todoFixmeCount} TODO/FIXME markers detected`,
      -10,
      [],
      'Reduce TODO/FIXME debt to improve maintainability signal.',
    )
  }

  const hasGitIgnore = Boolean(findFile(files, (name) => name === '.gitignore'))
  if (!hasGitIgnore) {
    codeHealthScore -= 15
    addFinding(
      'codeSmells',
      '.gitignore is missing',
      -15,
      [],
      'Add a .gitignore to prevent committing generated files and secrets.',
    )
  }

  const filenameFrequency = new Map<string, Set<string>>()
  for (const file of files) {
    const name = fileName(file.path).toLowerCase()
    if (!filenameFrequency.has(name)) {
      filenameFrequency.set(name, new Set<string>())
    }

    filenameFrequency.get(name)?.add(toPosix(file.path))
  }

  const duplicateFilenameCount = [...filenameFrequency.values()].filter(
    (paths) => paths.size > 1,
  ).length

  if (duplicateFilenameCount > 5) {
    codeHealthScore -= 10
    addFinding(
      'codeSmells',
      `${duplicateFilenameCount} duplicate filenames across directories`,
      -10,
      [],
      'Rename ambiguous duplicate filenames to reduce navigation and review errors.',
    )
  }

  if (hasDebugger) {
    codeHealthScore -= 10
    addFinding(
      'codeSmells',
      'debugger statements detected',
      -10,
      debuggerFiles,
      'Remove debugger statements before shipping production builds.',
    )
  }

  if (hasMixedLineEndings(files)) {
    codeHealthScore -= 5
    addFinding(
      'codeSmells',
      'Mixed line endings detected',
      -5,
      [],
      'Normalize line endings with .editorconfig and formatter rules.',
    )
  }

  codeHealthScore = clamp(Math.round(codeHealthScore), 0, 100)

  const categories: HealthCategories = {
    security: securityScore,
    dependencies: dependencyScore,
    complexity: complexityScore,
    documentation: documentationScore,
    testCoverage: testCoverageScore,
    codeSmells: codeHealthScore,
  }

  const weightedAverage =
    categories.security * CATEGORY_WEIGHTS.security +
    categories.dependencies * CATEGORY_WEIGHTS.dependencies +
    categories.complexity * CATEGORY_WEIGHTS.complexity +
    categories.documentation * CATEGORY_WEIGHTS.documentation +
    categories.testCoverage * CATEGORY_WEIGHTS.testCoverage +
    categories.codeSmells * CATEGORY_WEIGHTS.codeSmells

  const overall = clamp(Math.round(weightedAverage), 0, 100)
  const grade = scoreColorGrade(overall)

  const topIssues = [...breakdown]
    .sort((left, right) => {
      const delta = Math.abs(right.points) - Math.abs(left.points)
      if (delta !== 0) {
        return delta
      }

      return left.message.localeCompare(right.message)
    })
    .slice(0, 5)

  const seenImprovementMessages = new Set<string>()
  const improvements = improvementCandidates
    .sort((left, right) => right.estimatedGain - left.estimatedGain)
    .filter((candidate) => {
      if (seenImprovementMessages.has(candidate.message)) {
        return false
      }

      seenImprovementMessages.add(candidate.message)
      return true
    })
    .slice(0, 3)

  return {
    overall,
    grade,
    categories,
    breakdown,
    topIssues,
    improvements,
    busFactor: result.busFactor,
    maintainability: overall,
    dependencyFreshness: categories.dependencies,
  }
}

export function calculateHealthScore(input: HealthInput): HealthScore {
  const security = clamp(
    100 - input.vulnerabilityCount * 8,
    0,
    100,
  )
  const dependencies = clamp(100 - input.staleDependencies * 10, 0, 100)
  const complexity = clamp(100 - input.complexityAverage, 0, 100)
  const documentation = clamp(Math.round((input.testCoverage / 100) * 40), 0, 100)
  const testCoverage = clamp(input.testCoverage, 0, 100)
  const codeSmells = clamp(100 - input.staleDependencies * 4, 0, 100)

  const categories: HealthCategories = {
    dependencies,
    security,
    complexity,
    documentation,
    testCoverage,
    codeSmells,
  }

  const overall = Math.round(
    categories.security * CATEGORY_WEIGHTS.security +
      categories.dependencies * CATEGORY_WEIGHTS.dependencies +
      categories.complexity * CATEGORY_WEIGHTS.complexity +
      categories.documentation * CATEGORY_WEIGHTS.documentation +
      categories.testCoverage * CATEGORY_WEIGHTS.testCoverage +
      categories.codeSmells * CATEGORY_WEIGHTS.codeSmells,
  )

  return {
    overall,
    grade: scoreColorGrade(overall),
    categories,
    breakdown: [],
    topIssues: [],
    improvements: [],
  }
}
