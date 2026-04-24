import { useEffect, useMemo, useState } from 'react'
import type { AnalysisStage, RepoInfo } from '@/types'

export interface ProgressOverlayProps {
  isVisible: boolean
  repo: RepoInfo | null
  stages: AnalysisStage[]
  onCancel?: () => void
  onSkipContributors?: () => void
  onViewResults?: () => void
}

export function ProgressOverlay({
  isVisible,
  repo,
  stages,
  onCancel,
  onSkipContributors,
  onViewResults,
}: ProgressOverlayProps) {
  const [showViewResults, setShowViewResults] = useState(false)

  useEffect(() => {
    if (!isVisible) {
      setShowViewResults(false)
      return
    }

    const allDone = stages.length > 0 && stages.every((stage) => stage.status === 'done')
    if (!allDone) {
      setShowViewResults(false)
      return
    }

    const timer = window.setTimeout(() => setShowViewResults(true), 150)
    return () => window.clearTimeout(timer)
  }, [isVisible, stages])

  if (!isVisible) {
    return null
  }

  const fileReadStage = stages.find((stage) => stage.id === 'read-contents') ?? null
  const contributorStage = stages.find((stage) => stage.id === 'contributors') ?? null
  const allDone = stages.length > 0 && stages.every((stage) => stage.status === 'done')
  const showSkipContributors = contributorStage?.status === 'running'

  const eta = useMemo(() => {
    if (!fileReadStage?.startedAt || !fileReadStage.total || !fileReadStage.current) {
      return null
    }

    const elapsedSeconds = Math.max(1, (Date.now() - fileReadStage.startedAt) / 1000)
    const filesPerSecond = fileReadStage.current / elapsedSeconds
    if (!Number.isFinite(filesPerSecond) || filesPerSecond <= 0) {
      return null
    }

    const remaining = Math.max(0, fileReadStage.total - fileReadStage.current)
    return Math.ceil(remaining / filesPerSecond)
  }, [fileReadStage?.current, fileReadStage?.startedAt, fileReadStage?.total])

  return (
    <div className="progress-overlay" role="status" aria-live="polite">
      <div className="progress-panel">
        <header className="progress-header">
          <img
            className="progress-avatar"
            src={`https://github.com/${repo?.owner || 'github'}.png?size=96`}
            alt={repo?.owner ? `${repo.owner} avatar` : 'GitHub avatar'}
            loading="lazy"
          />
          <div className="progress-repo-meta">
            <h2 className="progress-repo-name">
              {repo ? `${repo.owner}/${repo.name}` : 'Preparing analysis'}
            </h2>
            <p className="progress-repo-description">
              {repo?.description || 'Inspecting repository structure and code intelligence pipeline.'}
            </p>
            <div className="progress-repo-badges">
              <span className="progress-repo-pill">{repo?.stars ?? 0} stars</span>
              <span className="progress-repo-pill">{repo?.language || 'Unknown'}</span>
            </div>
          </div>
        </header>

        <div className="progress-stage-list">
          {stages.map((stage) => (
            <div key={stage.id} className="progress-stage-row">
              <span className={`progress-stage-icon progress-${stage.status}`} aria-hidden="true" />
              <div className="progress-stage-body">
                <div className="progress-stage-label">{stage.label}</div>
                {stage.status === 'running' && stage.detail ? (
                  <div className="progress-stage-detail">{stage.detail}</div>
                ) : null}
                {stage.id === 'read-contents' && stage.status === 'running' ? (
                  <>
                    <div className="progress-track" aria-hidden="true">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.max(0, Math.min(100, stage.progress ?? 0))}%` }}
                      />
                    </div>
                    <div className="progress-stage-meta">
                      {stage.total ?? 0} files · est. {eta ?? '--'}s remaining
                    </div>
                    {stage.currentFile ? (
                      <div className="progress-stage-filename">{stage.currentFile}</div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <footer className="progress-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          {showSkipContributors ? (
            <button type="button" className="btn btn-ghost" onClick={onSkipContributors}>
              Skip contributors
            </button>
          ) : null}
          {allDone && showViewResults ? (
            <button
              type="button"
              className="btn btn-primary progress-view-results"
              onClick={onViewResults}
            >
              View results
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
