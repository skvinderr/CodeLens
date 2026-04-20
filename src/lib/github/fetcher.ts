import { Octokit } from '@octokit/rest'

export interface GitHubFetcherOptions {
  token?: string
  userAgent?: string
}

export interface RepositoryTreeEntry {
  path: string
  type: 'blob' | 'tree'
  sha?: string
}

export class GitHubFetcher {
  private readonly octokit: Octokit

  constructor(options: GitHubFetcherOptions = {}) {
    this.octokit = new Octokit({
      auth: options.token,
      userAgent: options.userAgent ?? 'CodeLens/0.1.0',
    })
  }

  async getRepositoryTree(
    owner: string,
    repo: string,
    ref = 'HEAD',
  ): Promise<RepositoryTreeEntry[]> {
    void owner
    void repo
    void ref
    void this.octokit
    return []
  }
}
