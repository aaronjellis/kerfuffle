import React, { useState, useRef } from 'react';
import {
  DisplayUnit,
  FaceArtwork,
  GeneratedBoxModel,
} from '../engine/types';
import { EXPORT_PROFILES, MACHINE_BED_PRESETS } from '../engine/presets';
import { effectiveLayer, resolveSheetArtworks } from '../engine/exporters';
import { fmt } from '../engine/fingerJointEngine';

interface Viewport2DProps {
  model: GeneratedBoxModel;
  artworks: FaceArtwork[];
  selectedFaceId: string;
  selectedArtworkId: string | null;
  displayUnit?: DisplayUnit;
  onSelectFace: (faceId: string) => void;
  onSelectArtwork: (artId: string | null) => void;
  onUpdateArtwork: (artId: string, patch: Partial<FaceArtwork>) => void;
  onToggleParam?: (
    key:
      | 'scoreInnerFaceLabels'
      | 'showDimensions'
      | 'showGuideLabels2D'
      | 'includeRegistrationMarks'
  ) => void;
}

export const Viewport2D: React.FC<Viewport2DProps> = ({
  model,
  artworks,
  selectedFaceId,
  selectedArtworkId,
  displayUnit = 'mm',
  onSelectFace,
  onSelectArtwork,
  onUpdateArtwork,
  onToggleParam,
}) => {
  const { params, panels2D, sheetWidthMm, sheetHeightMm } = model;
  const profile = EXPORT_PROFILES[params.exportProfile];
  // Fold lines follow the same rule as the exports: dashed perforations are cuts.
  const foldLayer = effectiveLayer({ id: 'fold', layer: 'score', d: '', closed: false, isFoldScore: true }, params);
  const foldColor = foldLayer === 'cut' ? profile.cutColor : profile.scoreColor;
  const bed =
    MACHINE_BED_PRESETS.find((b) => b.id === params.bedPresetId) || MACHINE_BED_PRESETS[0];

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragArt, setDragArt] = useState<{
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const panStartRef = useRef<{ x: number; y: number; px: number; py: number }>({
    x: 0,
    y: 0,
    px: 0,
    py: 0,
  });
  const svgRef = useRef<SVGSVGElement>(null);

  const viewW = Math.max(bed.widthMm, sheetWidthMm) + 40;
  const viewH = Math.max(bed.heightMm, sheetHeightMm) + 40;

  const resolvedArts = resolveSheetArtworks(panels2D, artworks);

  const clientDeltaToMm = (dxPx: number, dyPx: number) => {
    const svg = svgRef.current;
    if (!svg) return { dxMm: 0, dyMm: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = (viewW / zoom) / Math.max(1, rect.width);
    const scaleY = (viewH / zoom) / Math.max(1, rect.height);
    return { dxMm: dxPx * scaleX, dyMm: dyPx * scaleY };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.35, Math.min(6, Number((z * factor).toFixed(3)))));
  };

  const handlePointerDownBg = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      px: pan.x,
      py: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragArt) {
      const { dxMm, dyMm } = clientDeltaToMm(
        e.clientX - dragArt.startClientX,
        e.clientY - dragArt.startClientY
      );
      let nextX = Number((dragArt.origX + dxMm).toFixed(1));
      let nextY = Number((dragArt.origY + dyMm).toFixed(1));
      // Magnetic snap to piece center (0, 0) within 1.5mm unless Alt key is held
      if (!e.altKey) {
        if (Math.abs(nextX) <= 1.5) nextX = 0;
        if (Math.abs(nextY) <= 1.5) nextY = 0;
      }
      onUpdateArtwork(dragArt.id, {
        xMm: nextX,
        yMm: nextY,
      });
      return;
    }

    if (isPanning) {
      const { dxMm, dyMm } = clientDeltaToMm(
        e.clientX - panStartRef.current.x,
        e.clientY - panStartRef.current.y
      );
      setPan({
        x: panStartRef.current.px - dxMm,
        y: panStartRef.current.py - dyMm,
      });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDragArt(null);
  };

  const vbW = viewW / zoom;
  const vbH = viewH / zoom;
  const vbX = -20 + pan.x + (viewW - vbW) / 2;
  const vbY = -20 + pan.y + (viewH - vbH) / 2;

  return (
    <div className="viewport-2d-wrapper" onWheel={handleWheel}>
      <div className="viewport-2d-Hud">
        <span className="hud-chip">
          <span className="dot dot-cut" style={{ backgroundColor: profile.cutColor }} />
          Cut ({profile.cutColor})
        </span>
        <span className="hud-chip">
          <span className="dot dot-score" style={{ backgroundColor: foldColor }} />
          {foldLayer === 'cut' ? 'Perforation (cuts)' : 'Vector Score'} ({foldColor})
        </span>
        <span className="hud-chip">
          Sheet:{' '}
          {displayUnit === 'in'
            ? `${(sheetWidthMm / 25.4).toFixed(2)} × ${(sheetHeightMm / 25.4).toFixed(2)} in`
            : `${Math.round(sheetWidthMm)} × ${Math.round(sheetHeightMm)} mm`}
        </span>

        {onToggleParam && (
          <div className="hud-quick-toggles">
            <button
              type="button"
              className={`hud-toggle-pill ${params.scoreInnerFaceLabels ? 'active' : ''}`}
              onClick={() => onToggleParam('scoreInnerFaceLabels')}
              title="Toggle single-stroke vector scoring of each side's name onto the inner face (exported in SVG, PDF & DXF)"
            >
              Score Side Names: {params.scoreInnerFaceLabels ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={`hud-toggle-pill ${params.showDimensions ? 'active' : ''}`}
              onClick={() => onToggleParam('showDimensions')}
              title="Show or hide panel dimensions on the 2D sheet"
            >
              Dims
            </button>
            <button
              type="button"
              className={`hud-toggle-pill ${params.showGuideLabels2D ? 'active' : ''}`}
              onClick={() => onToggleParam('showGuideLabels2D')}
              title="Show or hide on-screen guide face names in the 2D preview"
            >
              Guides
            </button>
            <button
              type="button"
              className={`hud-toggle-pill ${params.includeRegistrationMarks ? 'active' : ''}`}
              onClick={() => onToggleParam('includeRegistrationMarks')}
              title="Toggle corner registration marks for Print+Cut"
            >
              Reg Marks
            </button>
          </div>
        )}

        <div className="hud-zoom-controls">
          <button
            type="button"
            className="hud-btn"
            onClick={() => setZoom((z) => Math.min(6, Number((z * 1.25).toFixed(2))))}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Reset view"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setZoom((z) => Math.max(0.35, Number((z * 0.8).toFixed(2))))}
            title="Zoom out"
          >
            −
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="viewport-2d-svg"
        viewBox={`${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}`}
        onPointerDown={handlePointerDownBg}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <pattern id="mm-grid-10" width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="rgba(148, 163, 184, 0.12)"
              strokeWidth="0.25"
            />
          </pattern>
          <pattern id="mm-grid-50" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="url(#mm-grid-10)" />
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="rgba(148, 163, 184, 0.28)"
              strokeWidth="0.4"
            />
          </pattern>
        </defs>

        {/* Machine Bed Work Area */}
        <rect
          x={0}
          y={0}
          width={bed.widthMm}
          height={bed.heightMm}
          fill="#0b1017"
          stroke={model.fitsOnBed ? '#334155' : '#ef4444'}
          strokeWidth={0.8}
          strokeDasharray="4 2"
        />
        <rect x={0} y={0} width={bed.widthMm} height={bed.heightMm} fill="url(#mm-grid-50)" />
        <text
          x={4}
          y={-4}
          fill={model.fitsOnBed ? '#94a3b8' : '#f87171'}
          fontSize="4.2"
          fontFamily="monospace"
        >
          {bed.name} {model.fitsOnBed ? '— Fits on 1 Sheet' : '— Exceeds Single Bed Area'}
        </text>

        {/* Registration Marks for xTool M2 Print-then-Cut */}
        {params.includeRegistrationMarks &&
          [
            [4, 4],
            [sheetWidthMm - 4, 4],
            [sheetWidthMm - 4, sheetHeightMm - 4],
            [4, sheetHeightMm - 4],
          ].map(([cx, cy], idx) => (
            <g key={`reg-${idx}`} opacity={0.85}>
              <circle
                cx={cx}
                cy={cy}
                r={1.8}
                fill="none"
                stroke="#f8fafc"
                strokeWidth={0.25}
              />
              <line
                x1={cx - 2.6}
                y1={cy}
                x2={cx + 2.6}
                y2={cy}
                stroke="#f8fafc"
                strokeWidth={0.25}
              />
              <line
                x1={cx}
                y1={cy - 2.6}
                x2={cx}
                y2={cy + 2.6}
                stroke="#f8fafc"
                strokeWidth={0.25}
              />
            </g>
          ))}

        {/* Nested 2D Panels */}
        {panels2D.map((panel) => {
          const isPanelSelected =
            panel.id === selectedFaceId || panel.id === `base-${selectedFaceId}`;
          return (
            <g
              key={panel.id}
              transform={`translate(${fmt(panel.sheetX)}, ${fmt(panel.sheetY)})`}
              onClick={(e) => {
                e.stopPropagation();
                if (!panel.subFaces || panel.subFaces.length === 0) {
                  onSelectFace(panel.id.replace(/^base-/, ''));
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* Subtle highlight fill for safe area */}
              <rect
                x={panel.safeRect.x}
                y={panel.safeRect.y}
                width={panel.safeRect.width}
                height={panel.safeRect.height}
                fill={
                  isPanelSelected
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(255, 255, 255, 0.02)'
                }
                stroke={isPanelSelected ? '#f59e0b' : 'rgba(148, 163, 184, 0.18)'}
                strokeWidth={isPanelSelected ? 0.5 : 0.25}
                strokeDasharray="2 1.5"
              />

              {/* Sub-faces for 1-piece folding cardboard dielines */}
              {panel.subFaces?.map((sf) => {
                const subSelected = sf.id === selectedFaceId;
                return (
                  <g
                    key={sf.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFace(sf.id);
                    }}
                  >
                    <rect
                      x={sf.x}
                      y={sf.y}
                      width={sf.width}
                      height={sf.height}
                      fill={
                        subSelected
                          ? 'rgba(245, 158, 11, 0.14)'
                          : 'rgba(255, 255, 255, 0.01)'
                      }
                      stroke={subSelected ? '#f59e0b' : 'transparent'}
                      strokeWidth={0.5}
                    />
                    {params.showGuideLabels2D && !params.scoreInnerFaceLabels && sf.name && (
                      <text
                        x={sf.x + sf.width / 2}
                        y={sf.y + sf.height / 2}
                        fill={subSelected ? '#fbbf24' : 'rgba(148, 163, 184, 0.45)'}
                        fontSize="3.8"
                        fontFamily="monospace"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {sf.name.toUpperCase()}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Vector Cut & Score Paths */}
              {panel.paths.map((path) => {
                const layer = effectiveLayer(path, params);
                if (layer === 'guide') return null;
                const isCut = layer === 'cut';
                return (
                  <path
                    key={path.id}
                    d={path.d}
                    fill="none"
                    stroke={isCut ? profile.cutColor : profile.scoreColor}
                    strokeWidth={isCut ? 0.55 : 0.45}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}

              {/* Face Label & Dimension Annotation */}
              {(!panel.subFaces || panel.subFaces.length === 0) &&
                params.showGuideLabels2D &&
                !params.scoreInnerFaceLabels &&
                panel.faceLabel && (
                  <text
                    x={panel.widthMm / 2}
                    y={panel.heightMm / 2}
                    fill={isPanelSelected ? '#fbbf24' : 'rgba(148, 163, 184, 0.55)'}
                    fontSize="4.2"
                    fontWeight="600"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                  >
                    {panel.faceLabel}
                  </text>
                )}

              {params.showDimensions && (
                <text
                  x={panel.widthMm / 2}
                  y={panel.heightMm - 2.2}
                  fill="rgba(148, 163, 184, 0.65)"
                  fontSize="3.1"
                  fontFamily="monospace"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {displayUnit === 'in'
                    ? `${(panel.widthMm / 25.4).toFixed(2)} × ${(panel.heightMm / 25.4).toFixed(2)} in`
                    : `${fmt(panel.widthMm)} × ${fmt(panel.heightMm)} mm`}
                </text>
              )}
            </g>
          );
        })}

        {/* Interactive User Artwork Overlays */}
        {resolvedArts.map(({ artwork, sheetCenterX, sheetCenterY }) => {
          const isSelected = artwork.id === selectedArtworkId;
          const x = sheetCenterX - artwork.widthMm / 2;
          const y = sheetCenterY - artwork.heightMm / 2;
          const rot =
            artwork.rotationDeg !== 0
              ? `rotate(${fmt(artwork.rotationDeg)} ${fmt(sheetCenterX)} ${fmt(sheetCenterY)})`
              : undefined;

          return (
            <g
              key={artwork.id}
              transform={rot}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectFace(artwork.faceId);
                onSelectArtwork(artwork.id);
                setDragArt({
                  id: artwork.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  origX: artwork.xMm,
                  origY: artwork.yMm,
                });
              }}
            >
              <image
                href={artwork.dataUrl}
                x={x}
                y={y}
                width={artwork.widthMm}
                height={artwork.heightMm}
                preserveAspectRatio="xMidYMid meet"
              />
              <rect
                x={x}
                y={y}
                width={artwork.widthMm}
                height={artwork.heightMm}
                fill="none"
                stroke={isSelected ? '#f59e0b' : 'rgba(56, 189, 248, 0.55)'}
                strokeWidth={isSelected ? 0.55 : 0.3}
                strokeDasharray={isSelected ? undefined : '1.5 1'}
              />
              {isSelected && Math.abs(artwork.xMm) < 0.05 && (
                <line
                  x1={sheetCenterX}
                  y1={y - 12}
                  x2={sheetCenterX}
                  y2={y + artwork.heightMm + 12}
                  stroke="#f59e0b"
                  strokeWidth={0.35}
                  strokeDasharray="1.5 1"
                  pointerEvents="none"
                />
              )}
              {isSelected && Math.abs(artwork.yMm) < 0.05 && (
                <line
                  x1={x - 12}
                  y1={sheetCenterY}
                  x2={x + artwork.widthMm + 12}
                  y2={sheetCenterY}
                  stroke="#f59e0b"
                  strokeWidth={0.35}
                  strokeDasharray="1.5 1"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
