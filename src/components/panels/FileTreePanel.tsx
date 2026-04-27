import { memo, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CodeLensFileNode } from '@/types'

export interface FileTreePanelProps {
  files: CodeLensFileNode[]
}

function flattenTree(nodes: CodeLensFileNode[], depth = 0): Array<{ node: CodeLensFileNode; depth: number }> {
  const flat: Array<{ node: CodeLensFileNode; depth: number }> = []
  for (const node of nodes) {
    flat.push({ node, depth })
    if (node.children?.length) {
      flat.push(...flattenTree(node.children, depth + 1))
    }
  }
  return flat
}

function FileTreePanelComponent({ files }: FileTreePanelProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const flattened = useMemo(() => flattenTree(files), [files])
  const shouldVirtualize = flattened.length > 200
  const virtualizer = useVirtualizer({
    count: flattened.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 12,
    enabled: shouldVirtualize,
  })
  const items = shouldVirtualize
    ? virtualizer.getVirtualItems().map((item) => ({
        ...item,
        entry: flattened[item.index],
      }))
    : flattened.map((entry, index) => ({ key: index, start: index * 28, entry }))

  return (
    <section className="panel" aria-label="File tree panel">
      <h2 className="panel-title">File Tree</h2>
      <div
        ref={parentRef}
        className="file-tree-scroll panel-body"
        style={{ maxHeight: 360, overflow: 'auto' }}
      >
        <ul
          className="list-reset"
          style={
            shouldVirtualize
              ? { height: `${virtualizer.getTotalSize()}px`, position: 'relative' }
              : undefined
          }
        >
          {items.map((item) => (
            <li
              key={String(item.key)}
              className={`file-tree-item ${
                item.entry.node.type === 'directory' ? 'is-directory' : 'is-file'
              }`}
              style={
                shouldVirtualize
                  ? {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${item.start}px)`,
                    }
                  : { paddingLeft: `${item.entry.depth * 14}px` }
              }
            >
              <span
                className="file-tree-line"
                style={!shouldVirtualize ? undefined : { paddingLeft: `${item.entry.depth * 14}px` }}
              >
                <span className="file-tree-token">
                  {item.entry.node.type === 'directory'
                    ? 'DIR'
                    : item.entry.node.extension?.toUpperCase() || 'FILE'}
                </span>{' '}
                <span className="file-tree-path">{item.entry.node.path}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export const FileTreePanel = memo(FileTreePanelComponent)
