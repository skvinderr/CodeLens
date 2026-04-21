import type {
  BusFactorAnalysis,
  Contributor,
  ContributorOwnershipShare,
  FileBusFactorRisk,
  FileContributors,
  GraphNode,
} from '@/types'
import { normalizePathKey } from '@/utils/ownershipUtils'

const SINGLE_OWNER_THRESHOLD = 0.8
const BUS_FACTOR_TARGET_SHARE = 0.8

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function daysSince(date: Date): number {
  const now = Date.now()
  const then = date.getTime()
  if (!Number.isFinite(then)) {
    return 3650
  }

  const deltaMs = Math.max(0, now - then)
  return deltaMs / (1000 * 60 * 60 * 24)
}

function recencyWeight(lastCommit: Date): number {
  const ageDays = daysSince(lastCommit)
  const decay = Math.exp(-ageDays / 365)
  return clamp(decay, 0.25, 1)
}

function volumeWeight(contributor: Contributor): number {
  const codeVolume = Math.max(0, contributor.additions + contributor.deletions)
  return Math.max(1, contributor.commits + codeVolume / 600)
}

function weightedCommitScore(contributor: Contributor): number {
  const lastCommit =
    contributor.lastCommit instanceof Date
      ? contributor.lastCommit
      : new Date(contributor.lastCommit)

  return volumeWeight(contributor) * recencyWeight(lastCommit)
}

function normalizeContributor(contributor: Contributor): Contributor {
  return {
    ...contributor,
    lastCommit:
      contributor.lastCommit instanceof Date
        ? contributor.lastCommit
        : new Date(contributor.lastCommit),
  }
}

function computeOwnership(contributors: Contributor[]): ContributorOwnershipShare[] {
  if (contributors.length === 0) {
    return []
  }

  const weighted = contributors.map((contributor) => {
    const normalized = normalizeContributor(contributor)
    return {
      contributor: normalized,
      weightedCommits: weightedCommitScore(normalized),
    }
  })

  const totalWeighted = weighted.reduce(
    (sum, item) => sum + item.weightedCommits,
    0,
  )

  if (totalWeighted <= 0) {
    return []
  }

  return weighted
    .map((item) => ({
      login: item.contributor.login,
      commits: item.contributor.commits,
      weightedCommits: item.weightedCommits,
      share: item.weightedCommits / totalWeighted,
      lastCommit: item.contributor.lastCommit,
    }))
    .sort((left, right) => {
      if (right.share !== left.share) {
        return right.share - left.share
      }
      return left.login.localeCompare(right.login)
    })
}

function computeBusFactor(ownership: ContributorOwnershipShare[]): number {
  if (ownership.length === 0) {
    return 0
  }

  let cumulativeShare = 0
  for (let index = 0; index < ownership.length; index += 1) {
    cumulativeShare += ownership[index].share
    if (cumulativeShare >= BUS_FACTOR_TARGET_SHARE) {
      return index + 1
    }
  }

  return ownership.length
}

function toFileRisk(filePath: string, contributors: Contributor[]): FileBusFactorRisk {
  const ownership = computeOwnership(contributors)
  const topOwner = ownership[0] ?? null
  const busFactor = computeBusFactor(ownership)

  return {
    filePath,
    uniqueContributors: ownership.length,
    busFactor,
    topContributor: topOwner?.login ?? null,
    topShare: topOwner?.share ?? 0,
    isSingleOwnerRisk: Boolean(topOwner && topOwner.share > SINGLE_OWNER_THRESHOLD),
    ownership,
  }
}

function riskLevelFromPercent(value: number): BusFactorAnalysis['riskLevel'] {
  if (value >= 45) {
    return 'high'
  }
  if (value >= 25) {
    return 'medium'
  }
  return 'low'
}

export function analyzeBusFactor(
  nodes: GraphNode[],
  contributorsByFile: Map<string, FileContributors>,
): BusFactorAnalysis {
  const normalizedContributorMap = new Map<string, FileContributors>()

  for (const [key, value] of contributorsByFile.entries()) {
    normalizedContributorMap.set(normalizePathKey(key), value)
    normalizedContributorMap.set(normalizePathKey(value.filePath), value)
  }

  const risks: FileBusFactorRisk[] = []

  for (const node of nodes) {
    const path = normalizePathKey(node.path || node.filePath || node.id)
    const entry = normalizedContributorMap.get(path)

    if (!entry) {
      continue
    }

    risks.push(toFileRisk(path, entry.contributors))
  }

  const singleOwnerFiles = risks.filter((risk) => risk.isSingleOwnerRisk).length
  const totalFiles = risks.length
  const globalSingleOwnerPercent =
    totalFiles === 0 ? 0 : (singleOwnerFiles / totalFiles) * 100

  return {
    files: risks.sort((left, right) => {
      if (right.topShare !== left.topShare) {
        return right.topShare - left.topShare
      }
      return left.filePath.localeCompare(right.filePath)
    }),
    totalFiles,
    singleOwnerFiles,
    globalSingleOwnerPercent,
    riskLevel: riskLevelFromPercent(globalSingleOwnerPercent),
  }
}
