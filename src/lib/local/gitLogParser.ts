import type { Contributor } from '@/types'

export interface CommitRecord {
  hash: string
  authorName: string
  authorEmail: string
  timestamp: string
}

export function parseGitLog(rawLog: string): CommitRecord[] {
  void rawLog
  return []
}

export function summarizeContributors(commits: CommitRecord[]): Contributor[] {
  void commits
  return []
}
