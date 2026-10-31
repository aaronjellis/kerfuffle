/**
 * The box's 3D scene parts that don't depend on React: each panel's pose as the box assembles, the
 * living-hinge lid's bendable geometry and its cut lines, and flat panels' surface lines. Shared by
 * Kerfuffle's viewport and the Atomm generator, so both draw the box the same way from one model.
 */
import * as THREE from 'three';
import { catchTongueEdge, catchTongueRadii, livingHingeCatch, livingHingeZoneCuts, wrapBendRadiusMm } from './fingerJointEngine';
import { buildRoundedRectPoints } from './roundedRect';
import type { GeneratedBoxModel, Panel3DTransform } from './types';

export const EDGE_COLOR = '#452c16';
export const EDGES_NAME = 'panel-edges';
export const LID_CUTS_NAME = 'lid-cuts';

/** A panel in the scene: its wrapper (moved as the box assembles), its meshes and its spec. */
export type PanelEntry = {
  wrapper: THREE.Group;
  /** One mesh per panel; the 3D box has one per print piece group. */
  meshes: THREE.Mesh[];
  spec: Panel3DTransform;
};

export function applyAssemblyTransform(
  map: Map<string, PanelEntry>,
  progress: number,
  model: GeneratedBoxModel
) {
  const templateId = model.params.templateId;
  const t = Math.max(0, Math.min(1, progress));
  // The living-hinge lid straightens out flat as it lifts away, and curls back over as it closes.
  const lid = map.get('living-hinge-lid');
  if (lid?.meshes[0]) bendLivingHingeLid(lid.meshes[0], model, lid.spec, (Math.PI / 2) * t * t * (3 - 2 * t));
  const isClamshell =
    templateId === 'finger-clamshell' ||
    templateId === '3d-snap-box';

  // Helper to compute the fold rotation & pivot of a single foldRig at global progress t
  const getFoldStep = (spec: Panel3DTransform) => {
    if (!spec.foldRig) return null;
    const [s0, s1] = spec.foldRig.stage;
    const localT = Math.max(0, Math.min(1, (t - s0) / Math.max(0.01, s1 - s0)));
    const localEase = localT * localT * (3 - 2 * localT);
    const angle =
      spec.foldRig.flatAngleRad * (1 - localEase) +
      spec.foldRig.foldedAngleRad * localEase;
    const axisVec =
      spec.foldRig.axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : spec.foldRig.axis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    const pivot = new THREE.Vector3(
      spec.foldRig.pivotOffset[0],
      spec.foldRig.pivotOffset[1],
      spec.foldRig.pivotOffset[2]
    );
    const slide = spec.foldRig.flatSlide;
    const slideVec = slide
      ? new THREE.Vector3(slide[0], slide[1], slide[2]).multiplyScalar(1 - localEase)
      : null;
    return { angle, axisVec, pivot, slideVec, parentId: spec.foldRig.parentId };
  };

  map.forEach(({ wrapper, spec }) => {
    if (isClamshell) {
      // For Clamshell:
      // t in [0.45 .. 1.0]: Box base & lid stay 100% assembled while lid hinges open/shut!
      // t in [0.0 .. 0.45]: Panels explode outward from the open-lid state.
      const explodeT = Math.max(0, Math.min(1, t / 0.45));
      const explodeEase = explodeT * explodeT * (3 - 2 * explodeT);

      const basePos = new THREE.Vector3(
        spec.explodedPos[0] * (1 - explodeEase) + spec.closedPos[0] * explodeEase,
        spec.explodedPos[1] * (1 - explodeEase) + spec.closedPos[1] * explodeEase,
        spec.explodedPos[2] * (1 - explodeEase) + spec.closedPos[2] * explodeEase
      );
      const baseQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(spec.rotation[0], spec.rotation[1], spec.rotation[2])
      );

      if (spec.foldRig) {
        const step = getFoldStep(spec)!;
        const rel = basePos.clone().sub(step.pivot);
        rel.applyAxisAngle(step.axisVec, step.angle);
        // Lift the entire open lid assembly vertically in World +Y during explode so it clears the base walls
        const lidLiftY =
          Math.max(60, Math.abs(spec.explodedPos[1] - spec.closedPos[1]) * 1.45) *
          (1 - explodeEase);
        const liftedPivot = step.pivot.clone();
        liftedPivot.y += lidLiftY;
        wrapper.position.copy(liftedPivot.add(rel));
        const foldQuat = new THREE.Quaternion().setFromAxisAngle(step.axisVec, step.angle);
        wrapper.quaternion.copy(foldQuat.multiply(baseQuat));
      } else {
        wrapper.position.copy(basePos);
        wrapper.quaternion.copy(baseQuat);
      }
      return;
    }

    if (spec.foldRig) {
      // Collect chain of fold steps from child up to root (e.g. tuck-flap -> top -> back)
      const chain: NonNullable<ReturnType<typeof getFoldStep>>[] = [];
      let currSpec: Panel3DTransform | undefined = spec;
      while (currSpec?.foldRig) {
        const step = getFoldStep(currSpec);
        if (!step) break;
        chain.push(step);
        currSpec = step.parentId ? map.get(step.parentId)?.spec : undefined;
      }

      const pos = new THREE.Vector3(spec.closedPos[0], spec.closedPos[1], spec.closedPos[2]);
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(spec.rotation[0], spec.rotation[1], spec.rotation[2])
      );

      // Apply child-first, then parent fold rotations around their respective pivots
      for (const step of chain) {
        // The slide moves the panel and everything folded onto it, so it goes in before the fold.
        if (step.slideVec) pos.add(step.slideVec);
        const rel = pos.clone().sub(step.pivot);
        rel.applyAxisAngle(step.axisVec, step.angle);
        pos.copy(step.pivot.clone().add(rel));
        const foldQuat = new THREE.Quaternion().setFromAxisAngle(step.axisVec, step.angle);
        quat.premultiply(foldQuat);
      }

      // If the root ancestor of this fold chain translates during explode (e.g. Telescoping Slip Lid), apply its translation
      if (currSpec) {
        const ease = t * t * (3 - 2 * t);
        pos.x += (currSpec.explodedPos[0] - currSpec.closedPos[0]) * (1 - ease);
        pos.y += (currSpec.explodedPos[1] - currSpec.closedPos[1]) * (1 - ease);
        pos.z += (currSpec.explodedPos[2] - currSpec.closedPos[2]) * (1 - ease);
      }

      wrapper.position.copy(pos);
      wrapper.quaternion.copy(quat);
    } else {
      const ease = t * t * (3 - 2 * t);
      const x = spec.explodedPos[0] * (1 - ease) + spec.closedPos[0] * ease;
      const y = spec.explodedPos[1] * (1 - ease) + spec.closedPos[1] * ease;
      const z = spec.explodedPos[2] * (1 - ease) + spec.closedPos[2] * ease;
      wrapper.position.set(x, y, z);
      wrapper.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
    }
  });
}


/**
 * The living-hinge wrap's two bends at `bend` radians each (π/2 closed, 0 laid flat), the top deck
 * held still. Each bend keeps its flat zone's length at mid-thickness, so straightening it
 * rolls the lip and the back wall out along the curve the way the sheet really unrolls.
 */
export function wrapBend(model: GeneratedBoxModel, bend: number) {
  const innerD = model.innerDims.depthMm;
  const innerH = model.innerDims.heightMm;
  const T = model.params.materialThicknessMm;
  const closedR = wrapBendRadiusMm(innerD, innerH);
  // The engine's flat zone length: the bend's length at mid-thickness, which bending keeps.
  const arcLength = (Math.PI * (closedR + T / 2)) / 2;
  const deckY = innerH / 2;
  const deckEdge = innerD / 2 - closedR;
  const flat = bend < 1e-4;
  const mid = flat ? Infinity : arcLength / bend;
  const r = mid - T / 2;
  /** [y, z] of the point `s` along the bend's mid-thickness from the deck, `d` out from its inner face. */
  const at = (isFront: boolean, s: number, d: number): [number, number] => {
    const zSign = isFront ? 1 : -1;
    if (flat) return [deckY + d, zSign * (deckEdge + s)];
    const phi = s / mid;
    return [deckY - r + (r + d) * Math.cos(phi), zSign * (deckEdge + (r + d) * Math.sin(phi))];
  };
  /**
   * Carries a part built on the closed wrap (bend π/2) to where it hangs off the bend's end now:
   * turned about x by the bend it has lost, its corner on the bend's end moved to match.
   */
  const carry = (isFront: boolean) => {
    const [cy, cz] = at(isFront, arcLength, 0);
    const closedEnd = new THREE.Vector3(0, deckY - closedR, (isFront ? 1 : -1) * (deckEdge + closedR));
    const turn = (isFront ? 1 : -1) * (bend - Math.PI / 2);
    return new THREE.Matrix4()
      .makeTranslation(0, cy, cz)
      .multiply(new THREE.Matrix4().makeRotationX(turn))
      .multiply(new THREE.Matrix4().makeTranslation(-closedEnd.x, -closedEnd.y, -closedEnd.z));
  };
  return { arcLength, at, carry };
}

/**
 * Builds the 3D curved living-hinge wrap lid mesh:
 * - Integrated Lower Back Wall (with finger joints) when 'one-piece-back' or 'side-arch-tabs',
 *   or mating Rear Finger-Jointed Skirt when 'finger-joint-back'
 * - Rear 90° bend wrapping over the back shoulder, its kerf cuts drawn by `buildLivingHingeCutLines`
 * - Flat top deck at Y = +innerH/2 + T/2 (with optional side-arch retainer slots)
 * - Front 90° bend wrapping over the front shoulder
 * - Front overhang lip + catch tongue overlapping the top of the lower front wall
 */
export function buildLivingHingeLidGeometry(
  model: GeneratedBoxModel,
  spec: Panel3DTransform,
  bend = Math.PI / 2
): THREE.BufferGeometry {
  const { params, innerDims } = model;
  const innerW = innerDims.widthMm;
  const innerD = innerDims.depthMm;
  const innerH = innerDims.heightMm;
  const T = spec.thicknessMm;
  const wFull = innerW + 2 * T;
  const attachMode = params.livingHingeAttachMode || 'one-piece-back';
  const hasSideArchTabs = attachMode === 'side-arch-tabs' || params.livingHingeTopGuides;

  const bendRadius = wrapBendRadiusMm(innerD, innerH);
  const straightH = Math.max(15, innerH - bendRadius);
  const topFlatD = Math.max(10, innerD - 2 * bendRadius);
  const frontLipH = Math.min(14, straightH * 0.38);
  const seamY = -innerH / 2 + straightH;
  const parts: THREE.BufferGeometry[] = [];

  // 1. Flat Top Deck (spans X in [-wFull/2 .. +wFull/2], Z in [-topFlatD/2 .. +topFlatD/2], Y in [innerH/2 .. innerH/2 + T])
  if (hasSideArchTabs) {
    // The deck with a notch in each side edge, where the side walls' guide tabs rise through it.
    const sideTabW = Math.min(16, Math.max(6, topFlatD * 0.45));
    const h = sideTabW / 2;
    const deckShape = new THREE.Shape([
      new THREE.Vector2(-wFull / 2, -topFlatD / 2),
      new THREE.Vector2(wFull / 2, -topFlatD / 2),
      new THREE.Vector2(wFull / 2, -h),
      new THREE.Vector2(wFull / 2 - T, -h),
      new THREE.Vector2(wFull / 2 - T, h),
      new THREE.Vector2(wFull / 2, h),
      new THREE.Vector2(wFull / 2, topFlatD / 2),
      new THREE.Vector2(-wFull / 2, topFlatD / 2),
      new THREE.Vector2(-wFull / 2, h),
      new THREE.Vector2(-wFull / 2 + T, h),
      new THREE.Vector2(-wFull / 2 + T, -h),
      new THREE.Vector2(-wFull / 2, -h),
    ]);
    const topDeck = new THREE.ExtrudeGeometry(deckShape, {
      depth: T,
      bevelEnabled: false,
    });
    // rotateX(PI/2) sends local (x, y, z) -> (x, -z, y); translate Y by innerH/2 + T so Y spans [innerH/2 .. innerH/2 + T]
    topDeck.rotateX(Math.PI / 2);
    topDeck.translate(0, innerH / 2 + T, 0);
    parts.push(topDeck);
  } else {
    const topDeck = new THREE.BoxGeometry(wFull, T, topFlatD);
    topDeck.translate(0, innerH / 2 + T / 2, 0);
    parts.push(topDeck);
  }

  const wrap = wrapBend(model, bend);

  // 2. Each bend: the sheet curved through `bend` about a line along x, inner radius chosen so its
  //    arc length stays the flat zone's. The cuts are drawn on it by `buildLivingHingeCutLines`.
  const addCurvedHingeZone = (isFront: boolean) => {
    const steps = 32;
    const ring = (d: number) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const [y, z] = wrap.at(isFront, (i / steps) * wrap.arcLength, d);
        // The shape's x is world -z: rotateY(π/2) below turns shape (x, y, depth) into world (depth, y, -x).
        return new THREE.Vector2(-z, y);
      });
    const shape = new THREE.Shape([...ring(T), ...ring(0).reverse()]);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: wFull, bevelEnabled: false });
    geom.rotateY(Math.PI / 2);
    geom.translate(-wFull / 2, 0, 0);
    parts.push(geom);
  };

  addCurvedHingeZone(false); // Rear living hinge bend
  addCurvedHingeZone(true); // Front living hinge bend

  // 3. Front Overhang Lip + Front Catch Tongue, built closed, then carried to the front bend's end.
  const frontLip = new THREE.BoxGeometry(wFull, frontLipH, T);
  frontLip.translate(0, seamY - frontLipH / 2, innerD / 2 + T / 2);
  frontLip.applyMatrix4(wrap.carry(true));
  parts.push(frontLip);

  // The catch tongue hangs below the lip, in its plane, into the front wall's notch, its finger
  // hole through the middle.
  const tongue = livingHingeCatch(params, innerW, straightH - frontLipH);
  const radii = catchTongueRadii(tongue.width, tongue.height);
  const tongueShape = new THREE.Shape(
    catchTongueEdge(tongue.width, tongue.height, radii.tip, radii.root).map((p) => new THREE.Vector2(p.x, -p.y))
  );
  if (tongue.hole) {
    const { width: hw, height: hh } = tongue.hole;
    tongueShape.holes.push(
      new THREE.Path(
        buildRoundedRectPoints(hw, hh, hh / 2).map(
          (p) => new THREE.Vector2(p.x - hw / 2, -tongue.height / 2 - (p.y - hh / 2))
        )
      )
    );
  }
  const catchTab = new THREE.ExtrudeGeometry(tongueShape, { depth: T, bevelEnabled: false });
  catchTab.translate(0, seamY - frontLipH, innerD / 2);
  catchTab.applyMatrix4(wrap.carry(true));
  parts.push(catchTab);

  // 4. Integrated Lower Back Wall (for 1-piece modes) OR Rear Finger-Jointed Edge (for 2-piece
  //    finger-joint-back mode), built closed at Y = seamY, Z in [-(innerD/2 + T) .. -innerD/2], then
  //    carried to the rear bend's end.
  if (spec.outlinePoints && spec.outlinePoints.length >= 3) {
    const rearShape = new THREE.Shape(
      spec.outlinePoints.map(
        (p) => new THREE.Vector2(p.x - wFull / 2, seamY - (p.y - T))
      )
    );
    const rearWallGeom = new THREE.ExtrudeGeometry(rearShape, {
      depth: T,
      bevelEnabled: false,
    });
    rearWallGeom.translate(0, 0, -(innerD / 2 + T));
    rearWallGeom.applyMatrix4(wrap.carry(false));
    parts.push(rearWallGeom);
  } else {
    const rearAnchor = new THREE.BoxGeometry(wFull, T * 1.5, T);
    rearAnchor.translate(0, seamY - T * 0.25, -innerD / 2 - T / 2);
    rearAnchor.applyMatrix4(wrap.carry(false));
    parts.push(rearAnchor);
  }

  return mergeBufferGeometries(parts);
}

/**
 * The wrap lid's kerf cuts as dark lines on the outside of both bends, laid along the curve as the
 * flat pattern wraps it: the front bend runs from the lip up to the deck, the rear from the deck down.
 */
export function buildLivingHingeCutLines(
  model: GeneratedBoxModel,
  spec: Panel3DTransform,
  bend = Math.PI / 2
): THREE.LineSegments {
  const T = spec.thicknessMm;
  const wFull = model.innerDims.widthMm + 2 * T;
  const wrap = wrapBend(model, bend);
  const L = wrap.arcLength;
  const cuts = livingHingeZoneCuts(model.params, wFull, L);
  const verts: number[] = [];
  for (const isFront of [true, false]) {
    // The front zone's cuts run from the lip (s = 0) up to the deck; the rear's from the deck down.
    const point = (x: number, s: number) => {
      const [y, z] = wrap.at(isFront, isFront ? L - s : s, T + 0.08);
      return [x - wFull / 2, y, z];
    };
    for (const shape of cuts) {
      for (const line of shape) {
        for (let i = 0; i + 1 < line.length; i++) {
          const a = line[i];
          const b = line[i + 1];
          // Long runs across the bend follow the curve in short steps.
          const n = Math.max(1, Math.ceil(Math.abs(b.y - a.y) / 1.5));
          for (let k = 0; k < n; k++) {
            const t0 = k / n;
            const t1 = (k + 1) / n;
            verts.push(...point(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0));
            verts.push(...point(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1));
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: EDGE_COLOR }));
  lines.name = LID_CUTS_NAME;
  return lines;
}

/**
 * Re-bends the wrap lid's mesh, its edges and its cut lines to `bend` radians per bend. Skips work
 * when the bend has barely moved, so dragging the slider stays smooth.
 */
export function bendLivingHingeLid(mesh: THREE.Mesh, model: GeneratedBoxModel, spec: Panel3DTransform, bend: number) {
  const last = mesh.userData.lidBend as number | undefined;
  if (last !== undefined && Math.abs(last - bend) < 0.004) return;
  mesh.userData.lidBend = bend;
  mesh.geometry.dispose();
  mesh.geometry = buildLivingHingeLidGeometry(model, spec, bend);
  const edges = mesh.getObjectByName(EDGES_NAME) as THREE.LineSegments | undefined;
  if (edges) {
    edges.geometry.dispose();
    edges.geometry = new THREE.EdgesGeometry(mesh.geometry, 20);
  }
  const cuts = mesh.getObjectByName(LID_CUTS_NAME) as THREE.LineSegments | undefined;
  if (cuts) {
    const fresh = buildLivingHingeCutLines(model, spec, bend);
    cuts.geometry.dispose();
    cuts.geometry = fresh.geometry;
    (fresh.material as THREE.Material).dispose();
  }
}

/** A flat panel's open cuts, drawn on both faces just proud of the wood. */
export function buildSurfaceLines(spec: Panel3DTransform): THREE.LineSegments {
  const verts: number[] = [];
  for (const z of [spec.thicknessMm / 2 + 0.05, -spec.thicknessMm / 2 - 0.05]) {
    for (const line of spec.surfaceLines ?? []) {
      for (let i = 0; i + 1 < line.length; i++) {
        for (const p of [line[i], line[i + 1]]) verts.push(p.x - spec.widthMm / 2, -(p.y - spec.heightMm / 2), z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: EDGE_COLOR }));
}

/**
 * Merges geometries into one, keeping normals and texture coordinates and sorting faces into two
 * groups: group 0 the faces (an extrusion's top and bottom, every face of a box), group 1 the sides
 * (an extrusion's walls). Give the mesh `[faceMaterial, sideMaterial]` to shade them apart.
 */
export function mergeBufferGeometries(
  geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const caps: { pos: number[]; norm: number[]; uv: number[] } = { pos: [], norm: [], uv: [] };
  const sides: { pos: number[]; norm: number[]; uv: number[] } = { pos: [], norm: [], uv: [] };

  for (const source of geometries) {
    const g = source.index ? source.toNonIndexed() : source;
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    // An extrusion's group 1 is its walls; anything else counts as faces.
    const isExtrude = (source as THREE.ExtrudeGeometry).type === 'ExtrudeGeometry';
    const groups = g.groups.length > 0 ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const group of groups) {
      const into = isExtrude && group.materialIndex === 1 ? sides : caps;
      const end = Math.min(pos.count, group.start + group.count);
      for (let i = group.start; i < end; i++) {
        into.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        into.norm.push(norm.getX(i), norm.getY(i), norm.getZ(i));
        into.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute([...caps.pos, ...sides.pos], 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute([...caps.norm, ...sides.norm], 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute([...caps.uv, ...sides.uv], 2));
  const capCount = caps.pos.length / 3;
  merged.addGroup(0, capCount, 0);
  merged.addGroup(capCount, sides.pos.length / 3, 1);
  return merged;
}
