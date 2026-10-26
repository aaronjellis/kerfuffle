import * as THREE from 'three';
import { BoxParameters } from './types';
import { generateBoxModel } from './boxGenerator';
import {
  buildClaspPieces,
  buildHingePieces,
  buildShellPieces,
  computePrintBoxDims,
  type PrintBoxDims,
} from './printParts';
import { geometriesToAsciiStl } from './stl';

/** Gap between base and lid on the bed in the combined file. */
const BED_GAP_MM = 12;

function resolveDims(params: BoxParameters): PrintBoxDims {
  // generateBoxModel resolves inner vs outer mode, so the STL matches the model and viewport.
  const { innerDims } = generateBoxModel(params);
  return computePrintBoxDims(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
}

/** Print-orientation geometries of one part, at the origin. */
function partGeometries(
  params: BoxParameters,
  dims: PrintBoxDims,
  part: 'base' | 'lid'
): THREE.BufferGeometry[] {
  return [
    ...buildShellPieces(dims, part, params.outerChamferMm),
    ...buildHingePieces(dims, part),
    ...buildClaspPieces(dims, part),
  ].map((piece) => piece.geometry);
}

/**
 * ASCII STL of the 3D-printed box: base at the origin and lid 12 mm to its right, both in print
 * orientation. Built from the same pieces the viewport renders.
 */
export function export3DPrintBoxStl(params: BoxParameters): string {
  const dims = resolveDims(params);
  const lid = partGeometries(params, dims, 'lid').map((g) =>
    g.clone().translate(dims.outerW + BED_GAP_MM, 0, 0)
  );
  return geometriesToAsciiStl('Kerfuffle_3DPrint_Box', [
    ...partGeometries(params, dims, 'base'),
    ...lid,
  ]);
}

/** One ASCII STL per part, each at the origin in print orientation. */
export function export3DPrintBoxStlParts(params: BoxParameters): { base: string; lid: string } {
  const dims = resolveDims(params);
  return {
    base: geometriesToAsciiStl('Kerfuffle_3DPrint_Base', partGeometries(params, dims, 'base')),
    lid: geometriesToAsciiStl('Kerfuffle_3DPrint_Lid', partGeometries(params, dims, 'lid')),
  };
}
