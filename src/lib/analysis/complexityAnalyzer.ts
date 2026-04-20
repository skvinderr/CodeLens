export interface ComplexityResult {
  cyclomatic: number
  cognitive: number
  maxNesting: number
}

export function analyzeComplexity(fileContent: string): ComplexityResult {
  void fileContent
  return { cyclomatic: 0, cognitive: 0, maxNesting: 0 }
}
