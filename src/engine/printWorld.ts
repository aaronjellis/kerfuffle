import * as THREE from 'three';
import { GeneratedBoxModel } from './types';
import {
  buildClaspPieces,
  buildHingePieces,
  buildShellPieces,
  computePrintBoxDims,
  type PrintPartId,
} from './printParts';

export interface PrintWorldPiece {
  partId: PrintPartId;
  geometry: THREE.BufferGeometry;
}

/**
 * The printed pieces of one part (shell, lip, hinge, clasp), placed in the assembled box's world
 * frame: Y up, +Z front, box centred on the origin, seam between the parts at
 * seamY = -(baseH + lidH) / 2 + baseH.
 *
 * Print frame -> world:
 * 1. Translate by (-outerW/2, -outerD/2, 0) to centre the footprint.
 * 2. rotateX(-pi/2): (x, y, z) -> (x, z, -y). Print Z (up from the bed) becomes world Y; the front
 *    face (print y = 0) lands at world z = +outerD/2 and the back at -outerD/2.
 * 3. Lid only: rotateZ(pi): (x, y, z) -> (-x, -y, z). This is the pi turn about the front-back
 *    axis the lid's print frame assumes: it turns the lid rim-down and mirrors x, which undoes the
 *    x mirror buildHingePieces applies to lid-owned knuckles. Front stays front.
 * 4. Base: translate by (0, -totalH/2, 0) so the bed is the box bottom and the rim is the seam.
 *    Lid: its rim is at y = -lidH after step 3; translate by (0, seamY + lidH, 0) so the rim is the
 *    seam and the plate top is +totalH/2.
 *
 * All steps are proper rotations or translations, so triangle winding is preserved.
 */
export function buildPrintPartWorldGeometry(
  model: GeneratedBoxModel,
  part: 'base' | 'lid'
): PrintWorldPiece[] {
  const { params, innerDims } = model;
  const dims = computePrintBoxDims(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  const totalH = dims.baseH + dims.lidH;
  const seamY = -totalH / 2 + dims.baseH;

  const m = new THREE.Matrix4().makeTranslation(-dims.outerW / 2, -dims.outerD / 2, 0);
  m.premultiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  if (part === 'lid') {
    m.premultiply(new THREE.Matrix4().makeRotationZ(Math.PI));
    m.premultiply(new THREE.Matrix4().makeTranslation(0, seamY + dims.lidH, 0));
  } else {
    m.premultiply(new THREE.Matrix4().makeTranslation(0, -totalH / 2, 0));
  }

  const pieces = [
    ...buildShellPieces(dims, part, params.outerChamferMm),
    ...buildHingePieces(dims, part),
    ...buildClaspPieces(dims, part),
  ];
  return pieces.map((piece) => ({
    partId: piece.partId,
    geometry: piece.geometry.clone().applyMatrix4(m),
  }));
}
