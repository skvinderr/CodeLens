import { expose } from 'comlink'
import { analyzeComplexity } from '@/lib/analysis/complexityAnalyzer'
import { computeHealthScore } from '@/lib/analysis/healthScorer'
import { parseImports } from '@/lib/analysis/importParser'
import { SecurityScanner } from '@/lib/analysis/securityScanner'
import { buildDependencyGraph } from '@/lib/graph/buildGraph'
import type { AnalysisResult, FileNode } from '@/types'

export interface WorkerFileInput {
  path: string
  content: string
  size: number
  contentUnavailable?: boolean
  warning?: string
}

export interface AnalysisWorkerApi {
  parseFiles(files: WorkerFileInput[]): Promise<FileNode[]>
  scanAll(files: FileNode[]): Promise<AnalysisResult['security']>
  buildDependencyGraph(files: FileNode[]): Promise<AnalysisResult['graph']>
  computeHealthScore(result: AnalysisResult): Promise<AnalysisResult['health']>
}

const api: AnalysisWorkerApi = {
  async parseFiles(files) {
    return files.map((file, index) => {
      const parsed = parseImports(file.content, file.path)
      analyzeComplexity(file.content)
      self.postMessage({
        type: 'progress',
        stage: 'read-contents',
        current: index + 1,
        total: files.length,
        filename: file.path,
      })

      return {
        id: file.path,
        path: file.path,
        name: file.path.split('/').pop() ?? file.path,
        extension: file.path.includes('.') ? file.path.split('.').pop() ?? '' : '',
        language: parsed.language,
        size: file.size,
        content: file.content,
        imports: parsed.imports.map((entry) => entry.path),
        exports: parsed.exports.map((entry) => entry.name),
        lineCount: parsed.lineCount,
        contentUnavailable: file.contentUnavailable,
        warning: file.warning,
      }
    })
  },

  async scanAll(files) {
    self.postMessage({ type: 'progress', stage: 'security', current: 1, total: 1 })
    return new SecurityScanner().scanAll(files)
  },

  async buildDependencyGraph(files) {
    self.postMessage({ type: 'progress', stage: 'graph', current: 1, total: 1 })
    return buildDependencyGraph(files)
  },

  async computeHealthScore(result) {
    self.postMessage({ type: 'progress', stage: 'health', current: 1, total: 1 })
    return computeHealthScore(result)
  },
}

expose(api)
