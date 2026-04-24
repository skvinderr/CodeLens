import type { GraphLayoutMode, GraphOverlayMode } from '@/store/useAppStore'

export interface OwnershipLegendItem {
  login: string
  color: string
  files: number
}

export interface GraphControlsProps {
  zoomLevel: number
  layoutMode: GraphLayoutMode
  overlayMode: GraphOverlayMode
  showOrphans: boolean
  detectedLanguages: string[]
  hiddenLanguages: string[]
  searchQuery: string
  ownershipLegend: OwnershipLegendItem[]
  onZoomIn: () => void
  onZoomOut: () => void
  onFitAll: () => void
  onResetLayout: () => void
  onLayoutModeChange: (mode: GraphLayoutMode) => void
  onOverlayModeChange: (mode: GraphOverlayMode) => void
  onToggleOrphans: () => void
  onToggleLanguage: (language: string) => void
  onSearchChange: (value: string) => void
  onPinAll: () => void
  onReleaseAll: () => void
}

const LAYOUT_MODES: Array<{ value: GraphLayoutMode; label: string; icon: string }> = [
  { value: 'force', label: 'Force', icon: 'F' },
  { value: 'radial', label: 'Radial', icon: 'R' },
  { value: 'hierarchical', label: 'Tree', icon: 'T' },
  { value: 'cluster', label: 'Cluster', icon: 'C' },
]

const OVERLAY_MODES: Array<{ value: GraphOverlayMode; label: string }> = [
  { value: 'language', label: 'Language' },
  { value: 'blast', label: 'Blast' },
  { value: 'size', label: 'Size' },
  { value: 'age', label: 'Age' },
  { value: 'tests', label: 'Tests' },
  { value: 'ownership', label: 'Ownership' },
]

const LEGACY_VIEW_MODES: Array<{ value: GraphLayoutMode; label: string }> = [
  { value: 'force', label: 'Force' },
  { value: 'radial', label: 'Radial' },
  { value: 'hierarchical', label: 'Hierarchical' },
]

export function GraphControls({
  zoomLevel,
  layoutMode,
  overlayMode,
  showOrphans,
  detectedLanguages,
  hiddenLanguages,
  searchQuery,
  ownershipLegend,
  onZoomIn,
  onZoomOut,
  onFitAll,
  onResetLayout,
  onLayoutModeChange,
  onOverlayModeChange,
  onToggleOrphans,
  onToggleLanguage,
  onSearchChange,
  onPinAll,
  onReleaseAll,
}: GraphControlsProps) {
  return (
    <section
      className="graph-controls graph-controls-floating"
      aria-label="Graph controls"
    >
      <div className="graph-controls-toolbar">
        <button type="button" onClick={onZoomIn}>
          Zoom +
        </button>
        <button type="button" onClick={onZoomOut}>
          Zoom -
        </button>
        <button type="button" onClick={onFitAll}>
          Fit All
        </button>
        <button type="button" onClick={onResetLayout}>
          Reset Layout
        </button>
      </div>

      <p className="graph-controls-meta">Zoom {zoomLevel.toFixed(2)}x</p>

      <div className="graph-controls-layout-row" aria-label="Layout modes">
        {LAYOUT_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={mode.value === layoutMode ? 'is-active graph-layout-button' : 'graph-layout-button'}
            onClick={() => onLayoutModeChange(mode.value)}
            aria-label={mode.label}
            title={mode.label}
          >
            <span aria-hidden="true">{mode.icon}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      <label className="graph-controls-search" htmlFor="graph-overlay-select">
        <span>Color by</span>
        <select
          id="graph-overlay-select"
          value={overlayMode}
          onChange={(event) =>
            onOverlayModeChange(event.target.value as GraphOverlayMode)
          }
        >
          {OVERLAY_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>

      {overlayMode === 'ownership' ? (
        <div className="graph-controls-ownership" aria-label="Ownership legend">
          <p className="graph-controls-meta">Contributor ownership</p>
          {ownershipLegend.length === 0 ? (
            <p className="graph-controls-empty">No contributor ownership data.</p>
          ) : (
            <ul className="graph-ownership-legend list-reset">
              {ownershipLegend.map((item) => (
                <li key={item.login}>
                  <span
                    className="graph-ownership-swatch"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <span className="graph-ownership-name">@{item.login}</span>
                  <span className="graph-ownership-files">{item.files}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="graph-controls-language-chips" aria-label="Language filters">
        {detectedLanguages.map((language) => {
          const isHidden = hiddenLanguages.includes(language)
          return (
            <button
              key={language}
              type="button"
              className={isHidden ? 'is-dimmed' : 'is-active'}
              onClick={() => onToggleLanguage(language)}
            >
              {language}
            </button>
          )
        })}
      </div>

      <div className="graph-controls-filter-row">
        <button type="button" onClick={onToggleOrphans}>
          {showOrphans ? 'Hide orphans' : 'Show orphans'}
        </button>
      </div>

      <label className="graph-controls-search" htmlFor="graph-search-input">
        <span>Search</span>
        <input
          id="graph-search-input"
          type="text"
          value={searchQuery}
          placeholder="path or filename"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <div className="graph-controls-toolbar graph-controls-pin-row">
        <button type="button" onClick={onPinAll}>
          Pin all
        </button>
        <button type="button" onClick={onReleaseAll}>
          Release all
        </button>
      </div>

      <div className="graph-controls-modes" role="tablist" aria-label="Legacy layout labels">
        {LEGACY_VIEW_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={mode.value === layoutMode ? 'is-active' : ''}
            onClick={() => onLayoutModeChange(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </section>
  )
}
