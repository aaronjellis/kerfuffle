import React, { useRef } from 'react';
import * as THREE from 'three';

export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** A view along a cube direction: each of x, y, z is -1, 0 or 1. One non-zero is a side, two an edge, three a corner. */
export type CubeDir = readonly [number, number, number];

export type QuarterTurn = 'left' | 'right' | 'up' | 'down';

const FACE_DIRS: Record<CubeFace, CubeDir> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
};

/**
 * The cube's sides in CSS 3D space (y down). Front is the box's +z, right its +x, top its +y, as
 * the engines place them. Top reads upright with Front toward you; Bottom, with Front away. `u` and
 * `v` are the box directions of the side's own right and down, so its 3×3 grid of hit areas can name
 * the edge or corner each one sits on.
 */
const FACES: { face: CubeFace; label: string; transform: string; u: CubeDir; v: CubeDir }[] = [
  { face: 'front', label: 'Front', transform: 'translateZ(var(--cube-half))', u: [1, 0, 0], v: [0, -1, 0] },
  { face: 'back', label: 'Back', transform: 'rotateY(180deg) translateZ(var(--cube-half))', u: [-1, 0, 0], v: [0, -1, 0] },
  { face: 'right', label: 'Right', transform: 'rotateY(90deg) translateZ(var(--cube-half))', u: [0, 0, -1], v: [0, -1, 0] },
  { face: 'left', label: 'Left', transform: 'rotateY(-90deg) translateZ(var(--cube-half))', u: [0, 0, 1], v: [0, -1, 0] },
  { face: 'top', label: 'Top', transform: 'rotateX(90deg) translateZ(var(--cube-half))', u: [1, 0, 0], v: [0, 0, 1] },
  { face: 'bottom', label: 'Bottom', transform: 'rotateX(-90deg) translateZ(var(--cube-half))', u: [1, 0, 0], v: [0, 0, -1] },
];

const STEPS = [-1, 0, 1] as const;

/** The view a side's grid cell picks: the side itself, the edge it borders or the corner it sits in. */
export function cellDir(n: CubeDir, u: CubeDir, v: CubeDir, col: number, row: number): CubeDir {
  return [0, 1, 2].map((i) => n[i] + col * u[i] + row * v[i]) as unknown as CubeDir;
}

/** "top front right", in that order, for a direction's aria label. */
export function dirName(dir: CubeDir): string {
  const parts = [
    dir[1] > 0 ? 'top' : dir[1] < 0 ? 'bottom' : '',
    dir[2] > 0 ? 'front' : dir[2] < 0 ? 'back' : '',
    dir[0] > 0 ? 'right' : dir[0] < 0 ? 'left' : '',
  ].filter(Boolean);
  const kind = parts.length === 3 ? ' corner' : parts.length === 2 ? ' edge' : '';
  return parts.join(' ') + kind;
}

// Top and bottom sit a hair off the pole, toward the front, so OrbitControls keeps a heading
// and the view comes out with Front at the bottom (Top) or the top (Bottom) of the screen.
const POLE_LEAN = 1e-4;

/** The camera's offset from its target for a view along `dir`, `distance` away. */
export function viewOffset(dir: CubeDir, distance: number): THREE.Vector3 {
  const lean = dir[0] === 0 && dir[2] === 0 ? POLE_LEAN : 0;
  return new THREE.Vector3(dir[0], dir[1], dir[2] + lean).normalize().multiplyScalar(distance);
}

/** The camera's offset from its target for a straight-on view of `face`, `distance` away. */
export function faceViewOffset(face: CubeFace, distance: number): THREE.Vector3 {
  return viewOffset(FACE_DIRS[face], distance);
}

/**
 * Where a quarter turn takes the camera from `offset`: left and right swing it a quarter turn round
 * the box, bringing that side to the front; up and down tip it a quarter turn over, stopping at the
 * top or bottom view.
 */
export function quarterTurnOffset(offset: THREE.Vector3, turn: QuarterTurn): THREE.Vector3 {
  if (turn === 'left' || turn === 'right') {
    return offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn === 'left' ? -Math.PI / 2 : Math.PI / 2);
  }
  const s = new THREE.Spherical().setFromVector3(offset);
  s.phi = THREE.MathUtils.clamp(s.phi + (turn === 'up' ? -1 : 1) * (Math.PI / 2), POLE_LEAN, Math.PI - POLE_LEAN);
  return new THREE.Vector3().setFromSpherical(s);
}

/**
 * The CSS transform that turns the cube as the camera sees the world: the camera's view rotation,
 * with y flipped on both sides because CSS y points down. No perspective, so the cube reads flat.
 */
export function cubeTransform(cameraQuaternion: THREE.Quaternion): string {
  const view = new THREE.Matrix4().makeRotationFromQuaternion(cameraQuaternion).transpose();
  const e = view.elements;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      if ((row === 1) !== (col === 1)) e[col * 4 + row] = -e[col * 4 + row];
    }
  }
  return `matrix3d(${e.map((v) => +v.toFixed(5)).join(',')})`;
}

interface ViewCubeProps {
  /** The turning body; the viewport writes its transform every frame without a re-render. */
  bodyRef: React.Ref<HTMLDivElement>;
  /** A drag on the cube, in screen pixels since the last move. */
  onOrbit: (dx: number, dy: number) => void;
  onPickView: (dir: CubeDir) => void;
  onQuarterTurn: (turn: QuarterTurn) => void;
}

const ARROWS: { turn: QuarterTurn; glyph: string; label: string }[] = [
  { turn: 'up', glyph: '▲', label: 'Turn a quarter turn up' },
  { turn: 'down', glyph: '▼', label: 'Turn a quarter turn down' },
  { turn: 'left', glyph: '◀', label: 'Turn a quarter turn left' },
  { turn: 'right', glyph: '▶', label: 'Turn a quarter turn right' },
];

/** How far a press travels before it counts as a drag rather than a tap; the 3D pick uses 5 px too. */
const DRAG_PX = 5;

/**
 * A labelled cube in the 3D view's corner: drag it to orbit; tap a side to look straight at it, an
 * edge to look between two sides or a corner for a corner view; the arrows turn a quarter turn.
 */
export const ViewCube: React.FC<ViewCubeProps> = ({ bodyRef, onOrbit, onPickView, onQuarterTurn }) => {
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  // A drag that ends on a side shouldn't also pick it.
  const suppressClickRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    suppressClickRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= DRAG_PX) return;
      drag.moved = true;
      suppressClickRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    onOrbit(dx, dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== e.pointerId) return;
    dragRef.current = null;
    // The click, if any, follows in this task; a later one (a key press) is a real pick.
    if (suppressClickRef.current) setTimeout(() => (suppressClickRef.current = false));
  };

  /** A click, unless it ends a drag. */
  const tap = (action: () => void) => () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    action();
  };

  return (
    <div
      className="view-cube"
      role="group"
      aria-label="View cube"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={bodyRef} className="view-cube-body">
        {FACES.map(({ face, label, transform, u, v }) => (
          <div key={face} className="view-cube-face" style={{ transform }}>
            {STEPS.map((row) =>
              STEPS.map((col) => {
                const dir = cellDir(FACE_DIRS[face], u, v, col, row);
                const centre = row === 0 && col === 0;
                return (
                  <button
                    key={`${row},${col}`}
                    type="button"
                    className={`view-cube-cell${centre ? ' is-centre' : ''}`}
                    aria-label={`View from ${dirName(dir)}`}
                    onClick={tap(() => onPickView(dir))}
                  >
                    {centre ? label : null}
                  </button>
                );
              })
            )}
          </div>
        ))}
      </div>
      {ARROWS.map(({ turn, glyph, label }) => (
        <button
          key={turn}
          type="button"
          className={`view-cube-arrow is-${turn}`}
          aria-label={label}
          onClick={tap(() => onQuarterTurn(turn))}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
};
