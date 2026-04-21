import type { AlertType, FileNode, SecurityAlert, SecurityFinding } from '@/types'

export interface SecurityScannerOptions {
  includeDependencies?: boolean
}

type Severity = SecurityAlert['severity']

interface ScanRule {
  type: AlertType
  severity: Severity
  pattern: RegExp
  description: string
  recommendation: string
  snippetMode?: 'token' | 'quoted-value' | 'connection' | 'webhook'
  shouldScan?: (path: string) => boolean
}

interface SeverityStats {
  critical: number
  high: number
  medium: number
  low: number
  total: number
}

const MAX_FILE_SIZE_BYTES = 200 * 1024

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'pdf',
  'zip',
  'gz',
  'tar',
  'rar',
  '7z',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'class',
  'jar',
  'o',
  'so',
  'dll',
  'exe',
  'bin',
])

const GENERATED_PATH_PATTERNS = [
  /(?:^|\/)node_modules\//i,
  /(?:^|\/)dist\//i,
  /(?:^|\/)build\//i,
  /(?:^|\/)coverage\//i,
  /(?:^|\/)\.next\//i,
  /(?:^|\/)out\//i,
  /(?:^|\/)__generated__\//i,
  /(?:^|\/)generated\//i,
  /\.min\.(?:js|css)$/i,
  /\.bundle\./i,
  /\.map$/i,
  /(?:^|\/)package-lock\.json$/i,
  /(?:^|\/)yarn\.lock$/i,
  /(?:^|\/)pnpm-lock\.yaml$/i,
]

const RULES: ScanRule[] = [
  {
    type: 'aws-access-key',
    severity: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/,
    description: 'AWS Access Key detected in source code.',
    recommendation: 'Remove the key, rotate it in AWS IAM, and load credentials from secure env vars or a secret manager.',
    snippetMode: 'token',
  },
  {
    type: 'private-key',
    severity: 'critical',
    pattern: /-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----/,
    description: 'Private key header detected in source code.',
    recommendation: 'Never commit private keys. Revoke exposed key material and store keys in a secure vault or key management service.',
  },
  {
    type: 'google-api-key',
    severity: 'critical',
    pattern: /AIza[0-9A-Za-z\-_]{35}/,
    description: 'Google API key detected in source code.',
    recommendation: 'Restrict and rotate this Google API key, then move it into runtime secrets and avoid committing it.',
    snippetMode: 'token',
  },
  {
    type: 'github-token',
    severity: 'critical',
    pattern: /ghp_[A-Za-z0-9]{36}/,
    description: 'GitHub personal access token detected.',
    recommendation: 'Revoke this token immediately and replace with a least-privileged token stored in secret management.',
    snippetMode: 'token',
  },
  {
    type: 'api-key',
    severity: 'high',
    pattern: /(api_key|apikey|api-key|x-api-key)\s*[=:]\s*['"][^'"]{16,}['"]/i,
    description: 'Generic API key literal detected in code.',
    recommendation: 'Move API keys to encrypted environment variables and inject them at runtime.',
    snippetMode: 'quoted-value',
  },
  {
    type: 'password',
    severity: 'high',
    pattern: /(password|passwd|pwd|secret)\s*[=:]\s*['"][^'"]{6,}['"]/i,
    description: 'Hardcoded password or secret detected.',
    recommendation: 'Remove hardcoded secrets and fetch credentials from a secure secret store.',
    snippetMode: 'quoted-value',
  },
  {
    type: 'jwt',
    severity: 'high',
    pattern: /eyJ[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_.+\/=]{20,}/,
    description: 'JWT token literal detected in code.',
    recommendation: 'Avoid embedding JWTs in source. Use short-lived runtime tokens and rotate compromised credentials.',
    snippetMode: 'token',
  },
  {
    type: 'connection-string',
    severity: 'high',
    pattern: /(mongodb|postgresql|mysql|redis):\/\/[^@\s]+:[^@\s]+@/i,
    description: 'Database connection string with credentials detected.',
    recommendation: 'Move DB credentials to managed secrets and avoid committing URI credentials.',
    snippetMode: 'connection',
  },
  {
    type: 'webhook-url',
    severity: 'high',
    pattern: /https:\/\/hooks\.(slack|discord)\.com\/[^\s'"]+/,
    description: 'Slack or Discord webhook URL detected.',
    recommendation: 'Rotate the webhook endpoint and load webhook URLs from secure runtime configuration.',
    snippetMode: 'webhook',
  },
  {
    type: 'hardcoded-ip',
    severity: 'medium',
    pattern: /\b(?!10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)(\d{1,3}\.){3}\d{1,3}\b/,
    description: 'Hardcoded public IP address detected.',
    recommendation: 'Move endpoint/IP configuration to environment settings and prefer DNS names over fixed public IPs.',
  },
  {
    type: 'todo-security',
    severity: 'medium',
    pattern: /TODO.*(?:auth|security|password|token|key)/i,
    description: 'Security-related TODO comment detected.',
    recommendation: 'Track this item in your issue system and schedule remediation before release.',
  },
  {
    type: 'eval-usage',
    severity: 'medium',
    pattern: /\beval\s*\(/,
    description: 'eval() usage detected.',
    recommendation: 'Replace eval with safe parsing or explicit function mapping to avoid code-injection risk.',
  },
  {
    type: 'innerhtml-assignment',
    severity: 'medium',
    pattern: /\.innerHTML\s*=/,
    description: 'innerHTML assignment detected.',
    recommendation: 'Use textContent or sanitized HTML rendering to prevent XSS injection vectors.',
  },
  {
    type: 'dangerous-html',
    severity: 'medium',
    pattern: /dangerouslySetInnerHTML/,
    description: 'dangerouslySetInnerHTML usage detected.',
    recommendation: 'Only render trusted, sanitized HTML and document sanitization controls near this code.',
  },
  {
    type: 'console-log',
    severity: 'low',
    pattern: /console\.log\(/,
    description: 'console.log statement detected in src code.',
    recommendation: 'Remove noisy logs or gate logging behind a debug flag before production deployment.',
    shouldScan: (path) => {
      const lowerPath = path.toLowerCase()
      const isInSrc = lowerPath.startsWith('src/') || lowerPath.includes('/src/')
      const isTestLike = /\.(test|spec)\./i.test(lowerPath)
      return isInSrc && !isTestLike
    },
  },
  {
    type: 'debugger',
    severity: 'low',
    pattern: /\bdebugger\b/,
    description: 'debugger statement detected.',
    recommendation: 'Remove debugger statements before committing production code.',
  },
  {
    type: 'insecure-http',
    severity: 'low',
    pattern: /(?:fetch|axios\.get|axios\.post)\s*\(\s*['"]http:\/\//,
    description: 'Insecure HTTP call detected in fetch/axios usage.',
    recommendation: 'Use HTTPS endpoints to prevent credential leakage and man-in-the-middle risks.',
  },
]

function createAlertId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

function extensionOf(path: string): string {
  const filename = toPosix(path).split('/').pop() ?? path
  if (!filename.includes('.')) {
    return ''
  }

  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function isLikelyBinary(content: string): boolean {
  if (!content) {
    return false
  }

  if (content.includes('\u0000')) {
    return true
  }

  const sample = content.slice(0, 2048)
  let controlChars = 0
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index)
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31)) {
      controlChars += 1
    }
  }

  return sample.length > 0 && controlChars / sample.length > 0.2
}

function shouldSkipPath(path: string): boolean {
  const normalizedPath = toPosix(path)
  return GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))
}

function shouldSkipFile(file: FileNode): boolean {
  if ((file.size ?? 0) > MAX_FILE_SIZE_BYTES) {
    return true
  }

  if (shouldSkipPath(file.path)) {
    return true
  }

  const extension = extensionOf(file.path)
  if (BINARY_EXTENSIONS.has(extension)) {
    return true
  }

  if (typeof file.content === 'string' && isLikelyBinary(file.content)) {
    return true
  }

  return false
}

function lineStartOffsets(content: string): number[] {
  const offsets = [0]
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      offsets.push(index + 1)
    }
  }
  return offsets
}

function indexToLineColumn(index: number, starts: number[]): { line: number; column: number } {
  let low = 0
  let high = starts.length - 1
  let lineIndex = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const start = starts[mid]

    if (start <= index) {
      lineIndex = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return {
    line: lineIndex + 1,
    column: index - starts[lineIndex] + 1,
  }
}

function extractLineSnippet(content: string, starts: number[], lineNumber: number): string {
  const lineIndex = Math.max(0, lineNumber - 1)
  const start = starts[lineIndex] ?? 0
  const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : content.length
  return content.slice(start, end).trim()
}

function maskMiddle(value: string, visibleStart = 4, visibleEnd = 4): string {
  if (value.length <= visibleStart + visibleEnd) {
    return `${value.slice(0, Math.max(1, visibleStart))}****`
  }

  return `${value.slice(0, visibleStart)}****${value.slice(value.length - visibleEnd)}`
}

function maskQuotedValue(value: string): string {
  return value.replace(/(['"])([^'"]{6,})(['"])/, (_full, quoteStart, secret, quoteEnd) => {
    const masked = maskMiddle(secret, 2, 2)
    return `${quoteStart}${masked}${quoteEnd}`
  })
}

function maskConnectionString(value: string): string {
  return value.replace(/:\/\/([^:@\s]+):([^@\s]+)@/, (_full, username, password) => {
    return `://${maskMiddle(username, 1, 1)}:${maskMiddle(password, 1, 1)}@`
  })
}

function maskWebhook(value: string): string {
  return value.replace(/(https:\/\/hooks\.(?:slack|discord)\.com\/)([^\s'"]+)/i, (_full, prefix, suffix) => {
    return `${prefix}${maskMiddle(suffix, 2, 2)}`
  })
}

function maskedSnippet(rule: ScanRule, rawMatch: string, lineSnippet: string): string {
  switch (rule.snippetMode) {
    case 'token':
      return maskMiddle(rawMatch)
    case 'quoted-value':
      return maskQuotedValue(rawMatch)
    case 'connection':
      return maskConnectionString(rawMatch)
    case 'webhook':
      return maskWebhook(rawMatch)
    default:
      return lineSnippet || rawMatch
  }
}

function ruleMatcher(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function dedupeKey(alert: SecurityAlert): string {
  return `${alert.filePath}|${alert.line}|${alert.type}|${alert.severity}|${alert.description}`
}

export class SecurityScanner {
  scanFile(path: string, content: string): SecurityAlert[] {
    if (!path || !content) {
      return []
    }

    const normalizedPath = toPosix(path)
    const starts = lineStartOffsets(content)
    const alerts: SecurityAlert[] = []

    for (const rule of RULES) {
      if (rule.shouldScan && !rule.shouldScan(normalizedPath)) {
        continue
      }

      const matcher = ruleMatcher(rule.pattern)
      let match = matcher.exec(content)

      while (match) {
        const rawMatch = match[0]
        if (rawMatch.length === 0) {
          matcher.lastIndex += 1
          match = matcher.exec(content)
          continue
        }

        const { line, column } = indexToLineColumn(match.index, starts)
        const lineSnippet = extractLineSnippet(content, starts, line)

        alerts.push({
          id: createAlertId(),
          filePath: normalizedPath,
          line,
          column,
          type: rule.type,
          severity: rule.severity,
          description: rule.description,
          snippet: maskedSnippet(rule, rawMatch, lineSnippet),
          recommendation: rule.recommendation,
        })

        match = matcher.exec(content)
      }
    }

    return alerts
  }

  scanAll(files: FileNode[]): SecurityAlert[] {
    const dedupe = new Set<string>()
    const alerts: SecurityAlert[] = []

    for (const file of files) {
      if (shouldSkipFile(file)) {
        continue
      }

      if (typeof file.content !== 'string' || file.content.length === 0) {
        continue
      }

      for (const alert of this.scanFile(file.path, file.content)) {
        const key = dedupeKey(alert)
        if (dedupe.has(key)) {
          continue
        }

        dedupe.add(key)
        alerts.push(alert)
      }
    }

    return alerts.sort((left, right) => {
      const severityDelta = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
      if (severityDelta !== 0) {
        return severityDelta
      }

      const fileDelta = left.filePath.localeCompare(right.filePath)
      if (fileDelta !== 0) {
        return fileDelta
      }

      const lineDelta = left.line - right.line
      if (lineDelta !== 0) {
        return lineDelta
      }

      return left.column - right.column
    })
  }
}

export function getSeverityStats(alerts: SecurityAlert[]): SeverityStats {
  const stats: SeverityStats = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: alerts.length,
  }

  for (const alert of alerts) {
    stats[alert.severity] += 1
  }

  return stats
}

export function scanForSecurityIssues(
  filePath: string,
  fileContent: string,
  options: SecurityScannerOptions = {},
): SecurityFinding[] {
  void options

  const scanner = new SecurityScanner()
  return scanner.scanFile(filePath, fileContent)
}
