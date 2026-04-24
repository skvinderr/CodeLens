import { Octokit } from '@octokit/rest'
import { registerRateLimitHooks } from '@/lib/github/rateLimit'
import type { Contributor, RepoInfo } from '@/types'

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '__pycache__',
])

const EXCLUDED_BINARY_EXTENSIONS = new Set([
  'jpg',
  'png',
  'gif',
  'svg',
  'ico',
  'woff',
  'ttf',
  'pdf',
  'zip',
  'tar',
  'gz',
])

const MAX_TREE_FILES = 500
const MAX_FILE_SIZE_BYTES = 500 * 1024

export class GitHubError extends Error {
  code:
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'PRIVATE'
    | 'NETWORK'
    | 'TOO_LARGE'
    | 'INVALID_URL'

  constructor(
    code:
      | 'NOT_FOUND'
      | 'RATE_LIMITED'
      | 'PRIVATE'
      | 'NETWORK'
      | 'TOO_LARGE'
      | 'INVALID_URL',
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'GitHubError'
  }
}

export interface FileTreeProgress {
  current: number
  total: number
  filename: string
}

export interface RepositoryTreeEntry {
  path: string
  type: 'blob' | 'tree'
  sha?: string
  size?: number
}

export class GitHubFetcher {
  private readonly octokit: Octokit
  private treeTrimmed = false
  private readonly signal?: AbortSignal

  constructor(
    token?: string,
    signal?: AbortSignal,
  ) {
    this.signal = signal
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'CodeLens/0.1.0',
    })

    registerRateLimitHooks(this.octokit)
  }

  async parseRepoUrl(url: string): Promise<RepoInfo> {
    const trimmedUrl = url.trim()

    if (!trimmedUrl) {
      throw new GitHubError('INVALID_URL', 'Repository URL is required.')
    }

    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`

    let parsedUrl: URL
    try {
      parsedUrl = new URL(normalizedUrl)
    } catch {
      throw new GitHubError('INVALID_URL', `Invalid GitHub URL: "${url}".`)
    }

    if (!/(^|\.)github\.com$/i.test(parsedUrl.hostname)) {
      throw new GitHubError('INVALID_URL', 'Only github.com repository URLs are supported.')
    }

    const segments = parsedUrl.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)

    if (segments.length < 2) {
      throw new GitHubError(
        'INVALID_URL',
        'Invalid GitHub repository URL. Expected format: github.com/{owner}/{repo}.',
      )
    }

    const owner = decodeURIComponent(segments[0])
    const repoName = decodeURIComponent(segments[1]).replace(/\.git$/i, '')

    if (!owner || !repoName) {
      throw new GitHubError('INVALID_URL', 'Repository owner and name could not be parsed from URL.')
    }

    let metadata
    try {
      const response = await this.octokit.repos.get({
        owner,
        repo: repoName,
        request: { signal: this.signal },
      })
      metadata = response.data
    } catch (error) {
      this.throwAsGitHubError(error, `Failed to fetch repository metadata for "${owner}/${repoName}".`)
    }

    let branch = metadata.default_branch

    if (segments[2]?.toLowerCase() === 'tree') {
      const branchSegments = segments.slice(3).map((segment) => decodeURIComponent(segment))

      if (branchSegments.length === 0) {
        throw new GitHubError(
          'INVALID_URL',
          'Invalid tree URL. Expected format: github.com/{owner}/{repo}/tree/{branch}/{path}.',
        )
      }

      branch = await this.resolveBranchFromTreeUrl(owner, repoName, branchSegments)
    }

    return {
      owner,
      name: repoName,
      branch,
      url: `https://github.com/${owner}/${repoName}`,
      description: metadata.description ?? '',
      stars: metadata.stargazers_count ?? 0,
      language: metadata.language ?? 'Unknown',
      defaultBranch: metadata.default_branch,
    }
  }

  async getFileTree(
    repo: RepoInfo,
    onProgress?: (progress: FileTreeProgress) => void,
  ): Promise<RepositoryTreeEntry[]> {
    const branch = repo.branch || repo.defaultBranch

    const branchResponse = await this.octokit.repos.getBranch({
      owner: repo.owner,
      repo: repo.name,
      branch,
      request: { signal: this.signal },
    })

    const treeSha = branchResponse.data.commit.commit.tree.sha
    const treeResponse = await this.octokit.git.getTree({
      owner: repo.owner,
      repo: repo.name,
      tree_sha: treeSha,
      recursive: '1',
      request: { signal: this.signal },
    })

    const filteredEntries: RepositoryTreeEntry[] = []
    for (const entry of treeResponse.data.tree) {
      if (entry.type !== 'blob' || typeof entry.path !== 'string' || !entry.sha) {
        continue
      }

      if (this.shouldExcludePath(entry.path)) {
        continue
      }

      filteredEntries.push({
        path: entry.path,
        type: 'blob',
        sha: entry.sha,
        size: entry.size,
      })
    }

    let resultEntries = filteredEntries
    if (resultEntries.length > MAX_TREE_FILES) {
      this.treeTrimmed = true
      resultEntries = [...resultEntries]
        .sort((left, right) => (right.size ?? 0) - (left.size ?? 0))
        .slice(0, MAX_TREE_FILES)
    }

    const total = resultEntries.length
    resultEntries.forEach((entry, index) => {
      onProgress?.({
        current: index + 1,
        total,
        filename: entry.path,
      })
    })

    return resultEntries
  }

  async getFileContent(repo: RepoInfo, path: string): Promise<string | null> {
    const cacheKey = `cl:${repo.owner}/${repo.name}/${path}`
    const cached = this.getCachedContent(cacheKey)
    if (cached !== null) {
      return cached
    }

    const response = await this.octokit.repos.getContent({
      owner: repo.owner,
      repo: repo.name,
      path,
      ref: repo.branch || repo.defaultBranch,
      request: { signal: this.signal },
    })

    const { data } = response
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      return null
    }

    if ((data.size ?? 0) > MAX_FILE_SIZE_BYTES) {
      throw new GitHubError('TOO_LARGE', `"${path}" is larger than the supported file limit.`)
    }

    const decoded = this.decodeBase64(data.content)
    this.cacheContent(cacheKey, decoded)

    return decoded
  }

  async getContributors(repo: RepoInfo, path: string): Promise<Contributor[]> {
    let commits
    try {
      const response = await this.octokit.repos.listCommits({
        owner: repo.owner,
        repo: repo.name,
        path,
        per_page: 10,
        sha: repo.branch || repo.defaultBranch,
        request: { signal: this.signal },
      })
      commits = response.data
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status?: number }).status ?? 0)
          : 0

      if (status === 422 || status === 403) {
        return []
      }

      this.throwAsGitHubError(
        error,
        `Failed to fetch contributors for "${path}" in ${repo.owner}/${repo.name}".`,
      )
    }

    const contributorsByLogin = new Map<string, Contributor>()

    for (const commit of commits) {
      const login =
        commit.author?.login ??
        commit.commit.author?.email ??
        commit.commit.author?.name

      if (!login) {
        continue
      }

      const commitDate = new Date(
        commit.commit.author?.date ?? new Date().toISOString(),
      )

      const existing = contributorsByLogin.get(login)
      if (existing) {
        existing.commits += 1
        if (commitDate > existing.lastCommit) {
          existing.lastCommit = commitDate
        }
        continue
      }

      contributorsByLogin.set(login, {
        login,
        avatarUrl: commit.author?.avatar_url ?? '',
        commits: 1,
        additions: 0,
        deletions: 0,
        lastCommit: commitDate,
      })
    }

    return [...contributorsByLogin.values()].sort(
      (left, right) => right.commits - left.commits,
    )
  }

  private async resolveBranchFromTreeUrl(
    owner: string,
    repoName: string,
    branchSegments: string[],
  ): Promise<string> {
    if (branchSegments.length === 1) {
      return branchSegments[0]
    }

    try {
      const response = await this.octokit.repos.listBranches({
        owner,
        repo: repoName,
        per_page: 100,
        request: { signal: this.signal },
      })
      const branchNames = new Set(response.data.map((branch) => branch.name))

      for (let index = branchSegments.length; index >= 1; index -= 1) {
        const candidate = branchSegments.slice(0, index).join('/')
        if (branchNames.has(candidate)) {
          return candidate
        }
      }
    } catch {
      // Fallback to first segment when branch listing is not available.
    }

    return branchSegments[0]
  }

  private shouldExcludePath(path: string): boolean {
    const normalizedPath = path.toLowerCase()
    const segments = normalizedPath.split('/')

    if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
      return true
    }

    if (
      normalizedPath.endsWith('.min.js') ||
      normalizedPath.endsWith('.min.css') ||
      normalizedPath.endsWith('.map')
    ) {
      return true
    }

    const extension = normalizedPath.includes('.')
      ? normalizedPath.split('.').pop() ?? ''
      : ''

    return EXCLUDED_BINARY_EXTENSIONS.has(extension)
  }

  private decodeBase64(base64: string): string {
    const normalized = base64.replace(/\n/g, '')
    const binaryString = atob(normalized)
    const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  private getCachedContent(cacheKey: string): string | null {
    if (typeof sessionStorage === 'undefined') {
      return null
    }

    return sessionStorage.getItem(cacheKey)
  }

  private cacheContent(cacheKey: string, content: string): void {
    if (typeof sessionStorage === 'undefined') {
      return
    }

    sessionStorage.setItem(cacheKey, content)
  }

  wasTreeTrimmed(): boolean {
    return this.treeTrimmed
  }

  private throwAsGitHubError(error: unknown, fallbackMessage: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
    ) {
      throw new DOMException('Request aborted', 'AbortError')
    }

    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status ?? 0)
        : 0

    if (status === 404) {
      throw new GitHubError('NOT_FOUND', fallbackMessage)
    }
    if (status === 401 || status === 403) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message ?? '')
          : ''

      if (/rate limit/i.test(message)) {
        throw new GitHubError('RATE_LIMITED', fallbackMessage)
      }

      throw new GitHubError('PRIVATE', fallbackMessage)
    }
    if (status === 413) {
      throw new GitHubError('TOO_LARGE', fallbackMessage)
    }

    throw new GitHubError('NETWORK', fallbackMessage)
  }
}
