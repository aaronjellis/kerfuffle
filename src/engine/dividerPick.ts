import type { PrintBoxDims } from './printParts';

/**
 * Between the 3D view and the dividers' interior frame. The world here is the assembled box's
 * frame (see `buildPrintPartWorldGeometry`): Y up, +Z front, centred on the origin. The interior
 * frame has its origin at the inner front-left corner, x across and y front to back.
 */

/** World y of the base's inside floor. */
export function floorWorldY(dims: PrintBoxDims): number {
  return -(dims.baseH + dims.lidH) / 2 + dims.floor;
}

/** A world point on the floor plane, in the interior frame. */
export function worldToInterior(dims: PrintBoxDims, world: { x: number; z: number }): { x: number; y: number } {
  return { x: world.x + dims.innerW / 2, y: dims.innerD / 2 - world.z };
}

/** An interior point, on the world's floor plane. */
export function interiorToWorld(dims: PrintBoxDims, p: { x: number; y: number }): { x: number; z: number } {
  return { x: p.x - dims.innerW / 2, z: dims.innerD / 2 - p.y };
}
