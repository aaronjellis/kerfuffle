import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { BoxParameters, DisplayUnit, FaceArtwork, GeneratedBoxModel } from '../engine/types';
import { MACHINE_BED_PRESETS } from '../engine/presets';
import { Viewport3D } from '../components/Viewport3D';
import { Viewport2D } from '../components/Viewport2D';
import { Segmented } from './Field';
import type { PartId } from './parts';
import { STAGE_ACCENT_HEX, STAGE_HEX } from './stageColors';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';

export type ViewMode = 'split' | '3d' | '2d';

interface StageProps {
  model: GeneratedBoxModel;
  params: BoxParameters;
  artworks: FaceArtwork[];
  displayUnit: DisplayUnit;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  selectedFaceId: string;
  onSelectFace: (faceId: string) => void;
  /** A face or an artwork picked in 2D: selects it app-wide, the same as a 3D pick. */
  onPickFace2D: (faceId: string) => void;
  selectedPart: PartId | null;
  /** A click on a 3D mesh, with the mesh's part id or face id. */
  onSelectMeshPart: (meshPartId: string) => void;
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
  viewMode: storedViewMode,
  onViewMode,
  showWireframe,
  onToggleWireframe,
  selectedFaceId,
  onSelectFace,
  onPickFace2D,
  selectedPart,
  onSelectMeshPart,
  selectedArtworkId,
  onSelectArtwork,
  onUpdateArtwork,
  onToggleParam,
}) => {
  // A phone's stage is too short to split: Split shows as 3D there, without changing the choice.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const viewMode: ViewMode = isPhone && storedViewMode === 'split' ? '3d' : storedViewMode;
  // The fold progress lives here, not in App: playing or scrubbing re-renders the stage only,
  // never the inspector. Viewport2D is memoised, so it skips these renders too.
  const [assemblyProgress, setAssemblyProgress] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const animDirRef = useRef(1);
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setAssemblyProgress((prev) => {
        let next = prev + animDirRef.current * dt * 0.42;
        if (next >= 1) {
          next = 1;
          animDirRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          animDirRef.current = 1;
        }
        return Number(next.toFixed(3));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);
  const onScrub = (progress: number) => {
    setIsPlaying(false);
    setAssemblyProgress(progress);
  };
  const onTogglePlay = () => setIsPlaying((p) => !p);

  const bed = MACHINE_BED_PRESETS.find((b) => b.id === params.bedPresetId) ?? MACHINE_BED_PRESETS[0];
  // "xTool M2 / M1 (385 × 300 mm)" reads as "xTool M2". Mid-sentence, a generic name drops its
  // capital ("Fits standard diode bed"); a brand keeps its own ("xTool", "Glowforge").
  const shortBedName = bed.name.replace(/\s*\(.*\)$/, '').replace(/\s*\/.*$/, '');
  const bedName = /^(xTool|Glowforge)\b/.test(shortBedName)
    ? shortBedName
    : shortBedName.charAt(0).toLowerCase() + shortBedName.slice(1);
  const { totalCutLengthMm, totalScoreLengthMm } = model.stats;
  const isLaser = params.category !== '3d-print';
  const pct = Math.round(assemblyProgress * 100);
  const openWord = params.category === 'cardboard-fold' ? 'Unfolded' : 'Exploded';
  const foldText = pct === 0 ? `${openWord} 0%` : `Closed ${pct}%`;
  // The orbit hint shows until the first click on the stage; it isn't remembered.
  const [hintDone, setHintDone] = useState(false);
  const shows3d = viewMode === 'split' || viewMode === '3d';

  return (
    <main className="stage" aria-label="Preview" onPointerDown={() => setHintDone(true)}>
      <div className={`stage-views mode-${viewMode}`}>
        {(viewMode === 'split' || viewMode === '3d') && (
          <div className="viewport-pane">
            <Viewport3D
              model={model}
              artworks={artworks}
              assemblyProgress={assemblyProgress}
              selectedFaceId={selectedFaceId}
              onSelectFace={onSelectFace}
              selectedPart={selectedPart}
              onSelectPart={onSelectMeshPart}
              accent={STAGE_ACCENT_HEX}
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
              onSelectFace={onPickFace2D}
              onSelectArtwork={onSelectArtwork}
              onUpdateArtwork={onUpdateArtwork}
              onToggleParam={onToggleParam}
            />
          </div>
        )}
      </div>

      {shows3d && !hintDone && <p className="stage-hint">Click a part to select it. Drag to orbit.</p>}

      <div className="stage-pill" role="group" aria-label="View controls">
        <Segmented<ViewMode>
          ariaLabel="View"
          value={viewMode}
          onChange={onViewMode}
          options={[
            { value: '3d', label: '3D' },
            { value: '2d', label: '2D' },
            ...(isPhone ? [] : [{ value: 'split' as const, label: 'Split' }]),
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
          aria-valuetext={foldText}
          onChange={(e) => onScrub(Number(e.target.value))}
        />
        <span className="stage-readout" aria-hidden="true">
          {foldText}
        </span>
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
