export interface ExportPayload {
  fileName: string
  data: string
  mimeType: string
}

export function downloadTextFile(payload: ExportPayload): void {
  const blob = new Blob([payload.data], { type: payload.mimeType })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = payload.fileName
  anchor.click()

  URL.revokeObjectURL(url)
}
