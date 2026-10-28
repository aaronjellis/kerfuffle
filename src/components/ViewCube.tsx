import React, { useRef } from 'react';
import * as THREE from 'three';

export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/**
 * The cube's sides in CSS 3D space (y down). Front is the box's +z, right its +x, top its +y, as
 * the engines place them. Top reads upright with Front toward you; Bottom, with Front away.
 */
const FACES: { face: CubeFace; label: string; transform: string }[] = [
  { face: 'front', label: 'Front', transform: 'translateZ(var(--cube-half))' },
  { face: 'back', label: 'Back', transform: 'rotateY(180deg) translateZ(var(--cube-half))' },
  { face: 'right', label: 'Right', transform: 'rotateY(90deg) translateZ(var(--cube-half))' },
  { face: 'left', label: 'Left', transform: 'rotateY(-90deg) translateZ(var(--cube-half))' },
  { face: 'top', label: 'Top', transform: 'rotateX(90deg) translateZ(var(--cube-half))' },
  { face: 'bottom', label: 'Bottom', transform: 'rotateX(-90deg) translateZ(var(--cube-half))' },
];

// Top and bottom sit a hair off the pole, toward the front, so OrbitControls keeps a heading
// and the view comes out with Front at the bottom (Top) or the top (Bottom) of the screen.
const POLE_LEAN = 1e-4;

/** The camera's offset from its target for a straight-on view of `face`, `distance` away. */
export function faceViewOffset(face: CubeFace, distance: number): THREE.Vector3 {
  const dir = {
    front: new THREE.Vector3(0, 0, 1),
    back: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    left: new THREE.Vector3(-1, 0, 0),
    top: new THREE.Vector3(0, 1, POLE_LEAN),
    bottom: new THREE.Vector3(0, -1, POLE_LEAN),
  }[face];
  return dir.normalize().multiplyScalar(distance);
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
  onPickFace: (face: CubeFace) => void;
}

/** How far a press travels before it counts as a drag rather than a tap; the 3D pick uses 5 px too. */
const DRAG_PX = 5;

/** A labelled cube in the 3D view's corner: drag it to orbit, tap a side to look straight at it. */
export const ViewCube: React.FC<ViewCubeProps> = ({ bodyRef, onOrbit, onPickFace }) => {
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
        {FACES.map(({ face, label, transform }) => (
          <button
            key={face}
            type="button"
            className="view-cube-face"
            style={{ transform }}
            aria-label={`View from ${face}`}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onPickFace(face);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
