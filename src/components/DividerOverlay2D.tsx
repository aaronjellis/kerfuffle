import React, { useRef, useState } from 'react';
import type { DividerPreview } from '../engine/printDividers';
import type { DisplayUnit, PrintDivider } from '../engine/types';
import { fmt } from '../engine/fingerJointEngine';
import { STAGE_ACCENT_HEX } from '../ui/stageColors';
import type { DividerEditing } from '../ui/useDividerEditing';

interface DividerOverlay2DProps {
  editing: DividerEditing;
  /** The interior's top-left corner in the base plan's frame. */
  originX: number;
  originY: number;
  displayUnit: DisplayUnit;
}

type Shape = Pick<PrintDivider, 'axis' | 'pos' | 'from' | 'to'>;

/** A divider's footprint in the interior frame, optionally widened for an easier grab. */
const footprint = (d: Shape, t: number, grow = 0) =>
  d.axis === 'y'
    ? { x: d.pos - t / 2 - grow, y: d.from, width: t + 2 * grow, height: d.to - d.from }
    : { x: d.from, y: d.pos - t / 2 - grow, width: d.to - d.from, height: t + 2 * grow };

/**
 * The divider tools on the printed base's plan. Drawn inside the plan's own group, moved to the
 * interior's corner, so every coordinate here is the interior frame the layout rules use; the
 * pointer is mapped through the group's screen matrix, which already holds the sheet's pan, zoom
 * and any quarter turn.
 */
export const DividerOverlay2D: React.FC<DividerOverlay2DProps> = ({ editing, originX, originY, displayUnit }) => {
  const groupRef = useRef<SVGGElement>(null);
  const [ghost, setGhost] = useState<DividerPreview | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragging = useRef(false);
  const { tool, layout, space, selectedId } = editing;
  if (tool === null) return null;

  const toInterior = (e: React.PointerEvent): { x: number; y: number } | null => {
    const m = groupRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const size = (mm: number) => (displayUnit === 'in' ? `${(mm / 25.4).toFixed(2)} in` : `${fmt(mm)} mm`);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const updateGhost = (e: React.PointerEvent) => {
    const p = toInterior(e);
    setGhost(p ? editing.preview(p) : null);
  };

  const ghostLabels = () => {
    if (!ghost) return null;
    const { divider: g, clearBefore, clearAfter } = ghost;
    const mid = (g.from + g.to) / 2;
    const before = g.pos - space.t / 2 - clearBefore / 2;
    const after = g.pos + space.t / 2 + clearAfter / 2;
    const at = (across: number) => (g.axis === 'y' ? { x: across, y: mid } : { x: mid, y: across });
    return [
      { key: 'before', ...at(before), text: size(clearBefore) },
      { key: 'after', ...at(after), text: size(clearAfter) },
    ].map((l) => (
      <text
        key={l.key}
        x={l.x}
        y={l.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={Math.min(4.2, Math.max(2.4, Math.min(clearBefore, clearAfter) / 4))}
        fill="#e6ecea"
        pointerEvents="none"
      >
        {l.text}
      </text>
    ));
  };

  return (
    <g ref={groupRef} transform={`translate(${fmt(originX)}, ${fmt(originY)})`} onClick={stop}>
      {/* The interior: where a divider can go, and what a press outside a divider hits. */}
      <rect
        x={0}
        y={0}
        width={space.w}
        height={space.d}
        fill="transparent"
        style={{ cursor: tool === 'place' ? 'crosshair' : 'default', touchAction: 'none' }}
        onPointerDown={(e) => {
          if (tool === 'move') {
            // Leave the press to the sheet, so a drag on empty floor still pans.
            editing.select(null);
            return;
          }
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          updateGhost(e);
        }}
        onPointerMove={tool === 'place' ? updateGhost : undefined}
        onPointerUp={(e) => {
          if (tool !== 'place' || e.button !== 0) return;
          const p = toInterior(e);
          if (p) editing.place(p);
          setGhost(null);
        }}
        onPointerLeave={() => setGhost(null)}
        onPointerCancel={() => setGhost(null)}
      />

      {layout.map((d) => {
        const lit = d.id === selectedId || (tool === 'move' && d.id === hoverId);
        return (
          <rect
            key={d.id}
            {...footprint(d, space.t)}
            fill={lit ? STAGE_ACCENT_HEX : '#c9d2d0'}
            pointerEvents="none"
          />
        );
      })}

      {tool === 'move' &&
        layout.map((d) => (
          <rect
            key={`hit-${d.id}`}
            {...footprint(d, space.t, 2)}
            fill="transparent"
            role="button"
            aria-label={`Divider, ${d.axis === 'y' ? 'front to back' : 'side to side'}`}
            aria-pressed={d.id === selectedId}
            style={{ cursor: d.axis === 'y' ? 'ew-resize' : 'ns-resize', touchAction: 'none' }}
            onPointerEnter={() => setHoverId(d.id)}
            onPointerLeave={() => setHoverId((id) => (id === d.id ? null : id))}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = true;
              editing.beginDrag(d.id);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              const p = toInterior(e);
              if (p) editing.dragTo(d.axis === 'y' ? p.x : p.y);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          />
        ))}

      {tool === 'place' && ghost && (
        <>
          <rect
            {...footprint(ghost.divider, space.t)}
            fill={STAGE_ACCENT_HEX}
            fillOpacity={0.35}
            stroke={STAGE_ACCENT_HEX}
            strokeWidth={0.4}
            strokeDasharray="2 1.2"
            pointerEvents="none"
          />
          {ghostLabels()}
        </>
      )}
    </g>
  );
};
