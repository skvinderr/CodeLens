import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'

export interface UseGitHubResult {
  token: string
  isConfigured: boolean
  setToken: (token: string) => void
}

export function useGitHub(): UseGitHubResult {
  const token = useAppStore((state) => state.githubToken)
  const setToken = useAppStore((state) => state.setGitHubToken)

  return useMemo(
    () => ({
      token,
      isConfigured: token.trim().length > 0,
      setToken,
    }),
    [setToken, token],
  )
}
