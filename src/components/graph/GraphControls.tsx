export type GraphViewMode = 'force' | 'radial' | 'hierarchical' | 'heatmap'

export interface GraphControlsProps {
  zoomLevel: number
  viewMode: GraphViewMode
  showOrphans: boolean
  detectedLanguages: string[]
  hiddenLanguages: string[]
  searchQuery: string
  onZoomIn: () => void
  onZoomOut: () => void
  onFitAll: () => void
  onResetLayout: () => void
  onViewModeChange: (mode: GraphViewMode) => void
  onToggleOrphans: () => void
  onToggleLanguage: (language: string) => void
  onSearchChange: (value: string) => void
  onPinAll: () => void
  onReleaseAll: () => void
}

const VIEW_MODES: Array<{ value: GraphViewMode; label: string }> = [
  { value: 'force', label: 'Force' },
  { value: 'radial', label: 'Radial' },
  { value: 'hierarchical', label: 'Hierarchical' },
  { value: 'heatmap', label: 'Heatmap' },
]

export function GraphControls({
  zoomLevel,
  viewMode,
  showOrphans,
  detectedLanguages,
  hiddenLanguages,
  searchQuery,
  onZoomIn,
  onZoomOut,
  onFitAll,
  onResetLayout,
  onViewModeChange,
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

      <div className="graph-controls-modes" role="tablist" aria-label="View modes">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={mode.value === viewMode ? 'is-active' : ''}
            onClick={() => onViewModeChange(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="graph-controls-filter-row">
        <button type="button" onClick={onToggleOrphans}>
          {showOrphans ? 'Hide orphans' : 'Show orphans'}
        </button>
      </div>

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
    </section>
  )
}
