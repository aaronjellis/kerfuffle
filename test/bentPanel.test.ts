import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { bentPoint, buildBentLines, buildBentPanelGeometry, panelEdgesGeometry, type BendSegment } from '../src/engine/bentPanel';
import { applyAssemblyTransform, EDGES_NAME, type PanelEntry } from '../src/engine/scene3d';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { Panel3DTransform } from '../src/engine/types';
import { wineCarrierLayout } from '../src/engine/wineBottles';

const T = 3;

describe('bent panels', () => {
  it('keeps lengths along the mid-surface', () => {
    const segs: BendSegment[] = [
      { kind: 'straight', lengthMm: 50 },
      { kind: 'arc', radiusMm: 20, angleRad: Math.PI / 3 },
      { kind: 'straight', lengthMm: 40 },
    ];
    const total = 50 + (20 * Math.PI) / 3 + 40;
    let walked = 0;
    let prev = bentPoint(segs, 0, 0);
    for (let i = 1; i <= 2000; i++) {
      const q = bentPoint(segs, (total * i) / 2000, 0);
      walked += Math.hypot(q.y - prev.y, q.z - prev.z);
      prev = q;
    }
    expect(Math.abs(walked - total) / total).toBeLessThan(0.005);
  });

  it('lands a carrier half where the layout says', () => {
    const p = { ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger' as const, templateId: 'finger-wine-carrier' as const };
    const l = wineCarrierLayout(p);
    const front = generateBoxModel(p).panels3D.find((q) => q.id === 'front')!;
    const segs = front.bend!.segments;
    const total = segs.reduce((s, g) => s + (g.kind === 'straight' ? g.lengthMm : g.radiusMm * Math.abs(g.angleRad)), 0);
    const end = bentPoint(segs, total, 0);
    // Bending toward the inside is local −z: the handle's mid-surface ends `inset` in from the body's.
    expect(end.z).toBeCloseTo(-l.insetMm, 1);
    expect(end.y).toBeCloseTo(l.bodyHeightMm + l.shoulderHeightMm + l.handleHeightMm, 1);
  });

  it('bends a flat panel with no seams', () => {
    const spec: Panel3DTransform = {
      id: 'strip',
      name: 'Strip',
      faceId: 'strip',
      widthMm: 50,
      heightMm: 200,
      thicknessMm: T,
      color: '#ccc',
      closedPos: [0, 0, 0],
      explodedPos: [0, 0, 0],
      rotation: [0, 0, 0],
      outlinePoints: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 200 },
        { x: 0, y: 200 },
      ],
      bend: {
        segments: [
          { kind: 'straight', lengthMm: 80 },
          { kind: 'arc', radiusMm: 20, angleRad: Math.PI / 2 },
          { kind: 'straight', lengthMm: 200 - 80 - 10 * Math.PI },
        ],
      },
    };
    const box = new THREE.Box3().setFromBufferAttribute(buildBentPanelGeometry(spec).getAttribute('position') as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(50, 1);
    // Up 80 and the bend's radius, plus half a ply on the outside of the top run.
    expect(size.y).toBeCloseTo(100 + T / 2, 0);
    // In by the radius and the top run, plus half a ply on the body's outside.
    expect(size.z).toBeCloseTo(20 + (200 - 80 - 10 * Math.PI) + T / 2, 0);
  });
});

describe('panel edges', () => {
  it('draws only the outline and holes, no lines across the face between holes', () => {
    const p = { ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger' as const, templateId: 'finger-wine-carrier' as const };
    const spec = generateBoxModel(p).panels3D.find((q) => q.id === 'front')!;
    const pos = panelEdgesGeometry(spec).getAttribute('position');
    const bodyTop = -spec.heightMm / 2 + wineCarrierLayout(p).bodyHeightMm;
    let across = 0;
    for (let i = 0; i < pos.count; i += 2) {
      const flat = Math.abs(pos.getY(i) - pos.getY(i + 1)) < 0.01;
      // The body's only full-width edges are its foot; nothing joins the slots across it.
      if (flat && pos.getY(i) > -spec.heightMm / 2 + 20 && pos.getY(i) < bodyTop - 1 && Math.abs(pos.getX(i + 1) - pos.getX(i)) > 20) across++;
    }
    expect(across).toBe(0);
  });
});

describe('bent panel edge lines', () => {
  it('follows the bend instead of cutting straight across it', () => {
    const p = { ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger' as const, templateId: 'finger-wine-carrier' as const };
    const spec = generateBoxModel(p).panels3D.find((q) => q.id === 'front')!;
    const pos = panelEdgesGeometry(spec).getAttribute('position');
    // No edge line longer than a few mm runs through a bend: long ones would be chords through the air.
    let longest = 0;
    for (let i = 0; i < pos.count; i += 2) {
      const dz = Math.abs(pos.getZ(i) - pos.getZ(i + 1));
      if (dz > 0.5) longest = Math.max(longest, Math.hypot(pos.getX(i) - pos.getX(i + 1), pos.getY(i) - pos.getY(i + 1), pos.getZ(i) - pos.getZ(i + 1)));
    }
    expect(longest).toBeLessThan(4);
  });
});

describe('bent panels in the assembly animation', () => {
  const p = { ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger' as const, templateId: 'finger-wine-carrier' as const };
  const model = generateBoxModel(p);
  const entries = () => {
    const map = new Map<string, PanelEntry>();
    for (const spec of model.panels3D.filter((q) => q.bend)) {
      const mesh = new THREE.Mesh(buildBentPanelGeometry(spec));
      const edges = new THREE.LineSegments(panelEdgesGeometry(spec));
      edges.name = EDGES_NAME;
      mesh.add(edges);
      mesh.add(buildBentLines(spec, spec.bend!.lines ?? []));
      map.set(spec.id, { wrapper: new THREE.Group(), meshes: [mesh], spec });
    }
    return map;
  };
  const size = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).getSize(new THREE.Vector3());

  it('lays the hinged pieces out flat when the box is fully open', () => {
    const map = entries();
    applyAssemblyTransform(map, 0, model);
    for (const { meshes, spec } of map.values()) {
      const [mesh] = meshes;
      expect(size(mesh.geometry).z).toBeCloseTo(T, 1);
      expect(size(mesh.geometry).y).toBeCloseTo(spec.heightMm, 1);
      // The edges and the hinge slits lie flat with it.
      for (const child of mesh.children) expect(size((child as THREE.LineSegments).geometry).z).toBeLessThan(T + 0.2);
    }
  });

  it('bends them back as it closes', () => {
    const map = entries();
    applyAssemblyTransform(map, 0, model);
    applyAssemblyTransform(map, 1, model);
    const front = map.get('front')!;
    expect(size(front.meshes[0].geometry).z).toBeCloseTo(size(buildBentPanelGeometry(front.spec)).z, 3);
  });
});
