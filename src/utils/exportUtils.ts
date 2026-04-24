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

function sanitizeFilePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')
}

function formatDatePart(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function inferRepoName(repoName?: string): string {
  return sanitizeFilePart((repoName || 'repo').split('/').pop() || 'repo')
}

function inlineComputedStyles(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const sourceNodes = [svg, ...Array.from(svg.querySelectorAll('*'))]
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))]

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index]
    if (!(cloneNode instanceof Element) || !(sourceNode instanceof Element)) {
      return
    }

    const computed = window.getComputedStyle(sourceNode)
    const styleText = Array.from(computed)
      .map((property) => `${property}:${computed.getPropertyValue(property)};`)
      .join('')
    cloneNode.setAttribute('style', styleText)
  })

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('viewBox')) {
    const width = svg.viewBox.baseVal.width || svg.clientWidth || Number(svg.getAttribute('width')) || 1200
    const height =
      svg.viewBox.baseVal.height || svg.clientHeight || Number(svg.getAttribute('height')) || 800
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  return new XMLSerializer().serializeToString(clone)
}

function getGraphSvg(): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>('#graph-canvas svg, svg#graph-canvas, .graph-canvas-svg')
  if (!svg) {
    throw new Error('Graph SVG not found.')
  }
  return svg
}

function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox.baseVal
  const width = box?.width || svg.clientWidth || Number(svg.getAttribute('width')) || 1200
  const height = box?.height || svg.clientHeight || Number(svg.getAttribute('height')) || 800
  return { width, height }
}

export function exportGraphSVG(repoName?: string): void {
  const svg = getGraphSvg()
  const serialized = inlineComputedStyles(svg)
  const fileName = `codelens-${inferRepoName(repoName)}-${formatDatePart()}.svg`
  triggerBlobDownload(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }), fileName)
}

export async function exportGraphPNG(repoName?: string): Promise<void> {
  const svg = getGraphSvg()
  const serialized = inlineComputedStyles(svg)
  const { width, height } = getSvgDimensions(svg)
  const ratio = Math.max(1, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas context unavailable.')
  }

  context.scale(ratio, ratio)
  const image = new Image()
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`

  await new Promise<void>((resolve, reject) => {
    image.onload = () => {
      context.drawImage(image, 0, 0, width, height)
      resolve()
    }
    image.onerror = () => reject(new Error('Failed to render SVG for PNG export.'))
    image.src = dataUrl
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result)
      } else {
        reject(new Error('Failed to create PNG blob.'))
      }
    }, 'image/png')
  })

  triggerBlobDownload(blob, `codelens-${inferRepoName(repoName)}.png`)
}

export function exportJSON(data: unknown, repoName?: string): void {
  const serialized = JSON.stringify(
    data,
    (_key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value.entries())
      }
      if (value instanceof Set) {
        return [...value]
      }
      return value
    },
    2,
  )

  triggerBlobDownload(
    new Blob([serialized], { type: 'application/json;charset=utf-8' }),
    `codelens-${inferRepoName(repoName)}-analysis.json`,
  )
}

export function exportSecurityMarkdown(
  alerts: Array<{ severity: string; filePath: string; line: number; description: string }>,
): void {
  const severityOrder = ['critical', 'high', 'medium', 'low']
  const grouped = new Map<string, typeof alerts>()

  for (const severity of severityOrder) {
    grouped.set(severity, alerts.filter((alert) => alert.severity === severity))
  }

  const lines = ['# Security Report', '', `Generated: ${new Date().toISOString()}`, '']
  for (const severity of severityOrder) {
    lines.push(`## ${severity[0].toUpperCase()}${severity.slice(1)}`)
    const entries = grouped.get(severity) ?? []
    if (entries.length === 0) {
      lines.push('- None')
    } else {
      for (const alert of entries) {
        lines.push(`- [ ] \`${alert.filePath}\` line ${alert.line} - ${alert.description}`)
      }
    }
    lines.push('')
  }

  triggerBlobDownload(
    new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }),
    'security-report.md',
  )
}

export function exportBlastReport(
  nodeLabel: string,
  rows: Array<{ filePath: string; distance: number; contribution: number }>,
): void {
  const lines = [
    `# Blast Radius Report: ${nodeLabel}`,
    '',
    '| affected file | distance | blast score contribution |',
    '| --- | ---: | ---: |',
    ...rows.map(
      (row) => `| ${row.filePath} | ${row.distance} | ${row.contribution.toFixed(2)} |`,
    ),
    '',
  ]

  triggerBlobDownload(
    new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }),
    `blast-${sanitizeFilePart(nodeLabel)}.md`,
  )
}
