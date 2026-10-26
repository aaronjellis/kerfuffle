import React from 'react';
import { Pause, Play } from 'lucide-react';
import type { BoxParameters, DisplayUnit, FaceArtwork, GeneratedBoxModel } from '../engine/types';
import { MACHINE_BED_PRESETS } from '../engine/presets';
import { Viewport3D } from '../components/Viewport3D';
import { Viewport2D } from '../components/Viewport2D';
import { Segmented } from './Field';

export type ViewMode = 'split' | '3d' | '2d';

/** The 3D scene's clear color. Keep in step with `--stage` in tokens.css. */
export const STAGE_HEX = '#2b3036';

interface StageProps {
  model: GeneratedBoxModel;
  params: BoxParameters;
  artworks: FaceArtwork[];
  displayUnit: DisplayUnit;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  assemblyProgress: number;
  onScrub: (progress: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  selectedFaceId: string;
  onSelectFace: (faceId: string) => void;
  selectedArtworkId: string | null;
  onSelectArtwork: (artId: string | null) => void;
  onUpdateArtwork: (artId: string, patch: Partial<FaceArtwork>) => void;
  onToggleParam: (key: keyof BoxParameters) => void;
}

const metres = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

/** The viewports, a floating pill of view controls, and a caption with lengths and bed fit. */
export const Stage: React.FC<StageProps> = ({
  model,
  params,
  artworks,
  displayUnit,
  viewMode,
  onViewMode,
  assemblyProgress,
  onScrub,
  isPlaying,
  onTogglePlay,
  showWireframe,
  onToggleWireframe,
  selectedFaceId,
  onSelectFace,
  selectedArtworkId,
  onSelectArtwork,
  onUpdateArtwork,
  onToggleParam,
}) => {
  const bed = MACHINE_BED_PRESETS.find((b) => b.id === params.bedPresetId) ?? MACHINE_BED_PRESETS[0];
  // "xTool M2 / M1 (385 × 300 mm)" reads as "xTool M2".
  const bedName = bed.name.replace(/\s*\(.*\)$/, '').replace(/\s*\/.*$/, '');
  const { totalCutLengthMm, totalScoreLengthMm } = model.stats;
  const isLaser = params.category !== '3d-print';
  const pct = Math.round(assemblyProgress * 100);

  return (
    <main className="stage" aria-label="Preview">
      <div className={`viewports-grid stage-views mode-${viewMode}`}>
        {(viewMode === 'split' || viewMode === '3d') && (
          <div className="viewport-pane">
            <Viewport3D
              model={model}
              artworks={artworks}
              assemblyProgress={assemblyProgress}
              selectedFaceId={selectedFaceId}
              onSelectFace={onSelectFace}
              showWireframe={showWireframe}
              background={STAGE_HEX}
            />
          </div>
        )}
        {(viewMode === 'split' || viewMode === '2d') && (
          <div className="viewport-pane">
            <Viewport2D
              model={model}
              artworks={artworks}
              selectedFaceId={selectedFaceId}
              selectedArtworkId={selectedArtworkId}
              displayUnit={displayUnit}
              onSelectFace={onSelectFace}
              onSelectArtwork={onSelectArtwork}
              onUpdateArtwork={onUpdateArtwork}
              onToggleParam={onToggleParam}
            />
          </div>
        )}
      </div>

      <div className="stage-pill" role="toolbar" aria-label="View">
        <Segmented<ViewMode>
          ariaLabel="View"
          value={viewMode}
          onChange={onViewMode}
          options={[
            { value: '3d', label: '3D' },
            { value: '2d', label: '2D' },
            { value: 'split', label: 'Split' },
          ]}
        />
        <span className="stage-pill-sep" aria-hidden="true" />
        <button
          type="button"
          className="stage-icon-btn"
          aria-label={isPlaying ? 'Pause' : 'Play fold animation'}
          title={isPlaying ? 'Pause' : 'Play fold animation'}
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <Pause size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Play size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
        <input
          type="range"
          className="stage-range"
          min={0}
          max={1}
          step={0.01}
          value={assemblyProgress}
          aria-label="Fold progress"
          aria-valuetext={`${pct}% ${params.category === 'cardboard-fold' ? 'folded' : 'assembled'}`}
          onChange={(e) => onScrub(Number(e.target.value))}
        />
        <button
          type="button"
          role="switch"
          aria-checked={showWireframe}
          className="stage-toggle"
          onClick={onToggleWireframe}
        >
          <span>Wireframe</span>
          <span className="switch-track switch-track-sm" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
        </button>
      </div>

      <p className="stage-caption">
        {totalCutLengthMm > 0 && <span>Cut {metres(totalCutLengthMm)}</span>}
        {totalScoreLengthMm > 0 && <span>Score {metres(totalScoreLengthMm)}</span>}
        {isLaser &&
          (model.fitsOnBed ? (
            <span>Fits {bedName} bed</span>
          ) : (
            <span className="stage-caption-warn">Too big for the {bedName} bed</span>
          ))}
      </p>
    </main>
  );
};
