import { useCallback, useMemo, useRef } from 'react'
import { GitHubError } from '@/lib/github/fetcher'
import { useAppStore } from '@/store/useAppStore'

export interface UseGitHubResult {
  token: string
  isConfigured: boolean
  setToken: (token: string) => void
  abortController: AbortController | null
  beginRequestBatch: () => AbortController
  abortActiveRequests: () => void
  handleGitHubError: (error: unknown) => void
}

export function useGitHub(): UseGitHubResult {
  const token = useAppStore((state) => state.githubToken)
  const setToken = useAppStore((state) => state.setGithubToken)
  const setError = useAppStore((state) => state.setError)
  const setWarning = useAppStore((state) => state.setWarning)
  const resetApp = useAppStore((state) => state.resetApp)
  const abortControllerRef = useRef<AbortController | null>(null)

  const beginRequestBatch = useCallback(() => {
    abortControllerRef.current?.abort()
    const next = new AbortController()
    abortControllerRef.current = next
    return next
  }, [])

  const abortActiveRequests = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    resetApp()
  }, [resetApp])

  const handleGitHubError = useCallback(
    (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      if (error instanceof GitHubError) {
        switch (error.code) {
          case 'NOT_FOUND':
            setError(
              'Repository not found or inaccessible. Check owner/repo spelling; for private repos use a token with repo read access.',
            )
            return
          case 'RATE_LIMITED':
            setError(
              'GitHub rate limit hit. Add a personal access token for 5,000 req/hr.',
            )
            return
          case 'PRIVATE':
            setError(
              'This repository is private. Use local folder mode to analyze private code.',
            )
            return
          case 'NETWORK':
            setError('Network error. Check your connection and try again.')
            return
          case 'TOO_LARGE':
            setWarning('Repository has too many files. Showing the largest 500 files.')
            return
          case 'INVALID_URL':
            setError(
              'Invalid repository input. Use owner/repo, github.com/owner/repo, https://github.com/owner/repo, or git@github.com:owner/repo.git',
            )
            return
        }
      }

      setError(error instanceof Error ? error.message : 'GitHub request failed.')
    },
    [setError, setWarning],
  )

  return useMemo(
    () => ({
      token,
      isConfigured: token.trim().length > 0,
      setToken,
      abortController: abortControllerRef.current,
      beginRequestBatch,
      abortActiveRequests,
      handleGitHubError,
    }),
    [beginRequestBatch, handleGitHubError, setToken, token, abortActiveRequests],
  )
}
