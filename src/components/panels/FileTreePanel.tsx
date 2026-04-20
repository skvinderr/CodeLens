import type { CodeLensFileNode } from '@/types'

export interface FileTreePanelProps {
  files: CodeLensFileNode[]
}

export function FileTreePanel({ files }: FileTreePanelProps) {
  return (
    <section className="panel" aria-label="File tree panel">
      <h2 className="panel-title">File Tree</h2>
      <ul className="list-reset panel-body">
        {files.map((file) => (
          <li key={file.id}>
            {file.type === 'directory' ? '[dir]' : '[file]'} {file.path}
          </li>
        ))}
      </ul>
    </section>
  )
}
