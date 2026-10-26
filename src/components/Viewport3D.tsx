import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FaceArtwork,
  GeneratedBoxModel,
  Panel3DTransform,
} from '../engine/types';
import { buildRoundedRectPoints } from '../engine/print3dEngine';

interface Viewport3DProps {
  model: GeneratedBoxModel;
  artworks: FaceArtwork[];
  assemblyProgress: number; // 0 = flat/exploded, 1 = closed/assembled
  selectedFaceId: string;
  onSelectFace: (faceId: string) => void;
  showWireframe: boolean;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  model,
  artworks,
  assemblyProgress,
  selectedFaceId,
  onSelectFace,
  showWireframe,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxGroupRef = useRef<THREE.Group | null>(null);
  const panelMeshesRef = useRef<
    Map<
      string,
      {
        wrapper: THREE.Group;
        mesh: THREE.Mesh;
        spec: Panel3DTransform;
      }
    >
  >(new Map());

  // 1. Initialize Three.js Scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f141c');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      40,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      1,
      5000
    );
    camera.position.set(220, 175, 250);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 1500;
    controls.minDistance = 40;
    controlsRef.current = controls;

    // Studio Lighting
    const ambient = new THREE.AmbientLight('#ffffff', 0.75);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#fffbeb', 1.15);
    keyLight.position.set(180, 320, 220);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#93c5fd', 0.45);
    fillLight.position.set(-220, 140, -180);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#f59e0b', 0.28);
    rimLight.position.set(0, -200, 150);
    scene.add(rimLight);

    // Studio Reference Grid (400x400mm with 10mm minor / 50mm major divisions)
    const grid = new THREE.GridHelper(500, 50, '#334155', '#1e293b');
    grid.position.y = -75;
    grid.name = 'studio-grid';
    scene.add(grid);

    const boxGroup = new THREE.Group();
    scene.add(boxGroup);
    boxGroupRef.current = boxGroup;

    // Raycaster for clicking faces in 3D
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = [];
      panelMeshesRef.current.forEach((v) => meshes.push(v.mesh));
      const hits = raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.faceId) {
          obj = obj.parent;
        }
        if (obj?.userData?.faceId) {
          onSelectFace(obj.userData.faceId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let animFrameId = 0;
    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    };
  }, []);

  // 2. Rebuild 3D Panel Geometries & Face Artwork Textures when model or artworks change
  useEffect(() => {
    const boxGroup = boxGroupRef.current;
    const scene = sceneRef.current;
    if (!boxGroup || !scene) return;

    // Position grid right under the bottom of the box
    const grid = scene.getObjectByName('studio-grid');
    if (grid) {
      grid.position.y = -model.outerDims.heightMm / 2 - 4;
    }

    // Clear previous meshes
    while (boxGroup.children.length > 0) {
      const child = boxGroup.children[0];
      boxGroup.remove(child);
    }
    panelMeshesRef.current.clear();

    for (const spec of model.panels3D) {
      const wrapper = new THREE.Group();
      let geometry: THREE.BufferGeometry;

      if (model.params.category === '3d-print') {
        geometry = build3DPrintShellGeometry(model, spec);
      } else if (spec.id === 'living-hinge-lid') {
        geometry = buildLivingHingeLidGeometry(model, spec);
      } else if (spec.outlinePoints && spec.outlinePoints.length >= 3) {
        const shape = new THREE.Shape(
          spec.outlinePoints.map(
            (p) => new THREE.Vector2(p.x - spec.widthMm / 2, -(p.y - spec.heightMm / 2))
          )
        );
        if (spec.holeContours) {
          for (const hole of spec.holeContours) {
            if (hole.length >= 3) {
              shape.holes.push(
                new THREE.Path(
                  hole.map(
                    (p) => new THREE.Vector2(p.x - spec.widthMm / 2, -(p.y - spec.heightMm / 2))
                  )
                )
              );
            }
          }
        }
        geometry = new THREE.ExtrudeGeometry(shape, {
          depth: spec.thicknessMm,
          bevelEnabled: false,
        });
        geometry.translate(0, 0, -spec.thicknessMm / 2);
      } else {
        geometry = new THREE.BoxGeometry(spec.widthMm, spec.heightMm, spec.thicknessMm);
      }

      const isSelected = spec.faceId === selectedFaceId || spec.id === selectedFaceId;
      const faceArts = artworks.filter(
        (a) => a.faceId === spec.faceId || a.faceId === spec.id
      );

      const baseMat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: model.params.category === '3d-print' ? 0.35 : 0.72,
        metalness: model.params.category === '3d-print' ? 0.12 : 0.04,
        wireframe: showWireframe,
        emissive: isSelected ? new THREE.Color('#f59e0b') : new THREE.Color('#000000'),
        emissiveIntensity: isSelected ? 0.14 : 0,
      });

      const mesh = new THREE.Mesh(geometry, baseMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { faceId: spec.faceId, panelId: spec.id };

      // Dark laser-charred edge highlight for wood & cardboard panels
      if (model.params.category !== '3d-print') {
        const edgesGeom = new THREE.EdgesGeometry(geometry, 20);
        const edgeMat = new THREE.LineBasicMaterial({
          color: isSelected ? '#f59e0b' : '#452c16',
          transparent: true,
          opacity: isSelected ? 0.95 : 0.65,
        });
        const edgeLines = new THREE.LineSegments(edgesGeom, edgeMat);
        mesh.add(edgeLines);
      }

      // Render user SVG / PNG Artwork decals directly onto the 3D panel face!
      if (faceArts.length > 0 && model.params.category !== '3d-print') {
        const decalPlane = createFaceArtworkDecalMesh(spec, faceArts);
        if (decalPlane) {
          if (spec.id === 'living-hinge-lid') {
            decalPlane.rotation.set(-Math.PI / 2, 0, 0);
            decalPlane.position.set(
              0,
              model.innerDims.heightMm / 2 + spec.thicknessMm + 0.15,
              0
            );
          }
          mesh.add(decalPlane);
        }
      }

      wrapper.add(mesh);
      boxGroup.add(wrapper);
      panelMeshesRef.current.set(spec.id, { wrapper, mesh, spec });
    }

    applyAssemblyTransform(panelMeshesRef.current, assemblyProgress, model.params.templateId);
  }, [model, artworks, selectedFaceId, showWireframe]);

  // 3. Smoothly update panel positions/rotations when assemblyProgress slider moves
  useEffect(() => {
    applyAssemblyTransform(panelMeshesRef.current, assemblyProgress, model.params.templateId);
  }, [assemblyProgress, model.params.templateId]);

  return <div ref={containerRef} className="viewport-3d-canvas" />;
};

function applyAssemblyTransform(
  map: Map<
    string,
    {
      wrapper: THREE.Group;
      mesh: THREE.Mesh;
      spec: Panel3DTransform;
    }
  >,
  progress: number,
  templateId?: string
) {
  const t = Math.max(0, Math.min(1, progress));
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
    return { angle, axisVec, pivot, parentId: spec.foldRig.parentId };
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

function createFaceArtworkDecalMesh(
  spec: Panel3DTransform,
  faceArts: FaceArtwork[]
): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  const pxPerMm = 6;
  canvas.width = Math.max(128, Math.round(spec.widthMm * pxPerMm));
  canvas.height = Math.max(128, Math.round(spec.heightMm * pxPerMm));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const renderAll = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const art of faceArts) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.save();
        const cx = (spec.widthMm / 2 + art.xMm) * pxPerMm;
        const cy = (spec.heightMm / 2 + art.yMm) * pxPerMm;
        const w = art.widthMm * pxPerMm;
        const h = art.heightMm * pxPerMm;
        ctx.translate(cx, cy);
        ctx.rotate((art.rotationDeg * Math.PI) / 180);
        if (art.mode === 'engrave') {
          ctx.filter = 'grayscale(100%) contrast(180%) brightness(45%)';
        }
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
        texture.needsUpdate = true;
      };
      img.src = art.dataUrl;
    }
  };
  renderAll();

  const planeGeom = new THREE.PlaneGeometry(spec.widthMm, spec.heightMm);
  const planeMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const decal = new THREE.Mesh(planeGeom, planeMat);
  decal.position.z = spec.thicknessMm / 2 + 0.15;
  return decal;
}

function build3DPrintShellGeometry(
  model: GeneratedBoxModel,
  spec: Panel3DTransform
): THREE.BufferGeometry {
  const { params, innerDims } = model;
  const wall = Math.max(1.2, params.wallThickness3dMm);
  const floor = Math.max(1.2, params.floorThickness3dMm);
  const outerW = spec.widthMm;
  const outerD = spec.heightMm;
  const shellH = spec.thicknessMm;
  const isLid = spec.id === '3d-lid';

  const rOut = Math.min(params.outerFilletMm, Math.min(outerW, outerD) * 0.25);
  const rIn = Math.min(params.innerFilletMm, Math.max(0.5, rOut - wall * 0.5));

  const outerPts = buildRoundedRectPoints(outerW, outerD, rOut, 8).map((p) => ({
    x: p.x - outerW / 2,
    y: p.y - outerD / 2,
  }));
  const innerPts = buildRoundedRectPoints(
    innerDims.widthMm,
    innerDims.depthMm,
    rIn,
    8
  ).map((p) => ({
    x: p.x - innerDims.widthMm / 2,
    y: p.y - innerDims.depthMm / 2,
  }));

  const parts: THREE.BufferGeometry[] = [];
  const wallH = Math.max(1, shellH - floor);

  // Note: ExtrudeGeometry extrudes along +Z from 0 to depth.
  // Calling rotateX(Math.PI / 2) sends local (x, y, z) -> (x, -z, y),
  // so z in [0..depth] becomes Y in [0..-depth].
  // To make local Y span [-shellH/2 .. +shellH/2]:
  // 1. Solid Floor (for Base, at bottom Y in [-shellH/2 .. -shellH/2 + floor])
  //    or Solid Roof (for Lid, at top Y in [+shellH/2 - floor .. +shellH/2])
  const solidShape = new THREE.Shape(
    outerPts.map((p) => new THREE.Vector2(p.x, p.y))
  );
  const capGeom = new THREE.ExtrudeGeometry(solidShape, {
    depth: floor,
    bevelEnabled: params.outerChamferMm > 0,
    bevelSize: Math.min(params.outerChamferMm, wall * 0.35),
    bevelThickness: Math.min(params.outerChamferMm, floor * 0.45),
    bevelSegments: 1,
  });
  capGeom.rotateX(Math.PI / 2);
  if (isLid) {
    // Roof cap sits at the top of the lid: Y from +shellH/2 down to +shellH/2 - floor
    capGeom.translate(0, shellH / 2, 0);
  } else {
    // Floor cap sits at the bottom of the base: Y from -shellH/2 + floor down to -shellH/2
    capGeom.translate(0, -shellH / 2 + floor, 0);
  }
  parts.push(capGeom);

  // 2. Hollow Perimeter Walls (for Base: Y from +shellH/2 down to -shellH/2 + floor;
  //    for Lid: Y from +shellH/2 - floor down to -shellH/2)
  const wallShape = new THREE.Shape(
    outerPts.map((p) => new THREE.Vector2(p.x, p.y))
  );
  wallShape.holes.push(
    new THREE.Path(
      innerPts
        .slice()
        .reverse()
        .map((p) => new THREE.Vector2(p.x, p.y))
    )
  );
  const wallGeom = new THREE.ExtrudeGeometry(wallShape, {
    depth: wallH,
    bevelEnabled: false,
  });
  wallGeom.rotateX(Math.PI / 2);
  if (isLid) {
    wallGeom.translate(0, shellH / 2 - floor, 0);
  } else {
    wallGeom.translate(0, shellH / 2, 0);
  }
  parts.push(wallGeom);

  // 3. Front Snap-Fit Clasp (at +Z front face)
  if (params.includeSnapClasp) {
    const claspW = Math.min(24, outerW * 0.26);
    if (isLid) {
      // Lid cantilevered latch arm hanging down over the front seam
      const armGeom = new THREE.BoxGeometry(claspW, 10, 2.8);
      armGeom.translate(0, -shellH / 2 - 2.5, outerD / 2 + 1.4);
      parts.push(armGeom);
    } else {
      // Base catch ridge near the top of the front wall
      const catchGeom = new THREE.BoxGeometry(claspW + 2, 4, 2.6);
      catchGeom.translate(0, shellH / 2 - 4.5, outerD / 2 + 1.3);
      parts.push(catchGeom);
    }
  }

  // 4. Rear Knuckle Hinge Lugs (at -Z back face)
  if (params.include3dHinge) {
    const lugW = Math.min(14, outerW * 0.16);
    if (isLid) {
      const centerKnuckle = new THREE.BoxGeometry(lugW, 6, 4.5);
      centerKnuckle.translate(0, -shellH / 2, -outerD / 2 - 2.0);
      parts.push(centerKnuckle);
    } else {
      for (const sign of [-1, 1]) {
        const sideKnuckle = new THREE.BoxGeometry(lugW, 6, 4.5);
        sideKnuckle.translate(sign * (lugW + 1), shellH / 2, -outerD / 2 - 2.0);
        parts.push(sideKnuckle);
      }
    }
  }

  return mergeBufferGeometries(parts);
}

/**
 * Builds the 3D curved living-hinge wrap lid mesh:
 * - Integrated Lower Back Wall (with finger joints) when 'one-piece-back' or 'side-arch-tabs',
 *   or mating Rear Finger-Jointed Skirt when 'finger-joint-back'
 * - Rear 90° curved kerf-lattice hinge zone with alternating uncut wood bridges wrapping over the back shoulder
 * - Flat top deck at Y = +innerH/2 + T/2 (with optional side-arch retainer slots)
 * - Front 90° curved kerf-lattice hinge zone with alternating uncut wood bridges wrapping over the front shoulder
 * - Front overhang lip + catch tongue overlapping the top of the lower front wall
 */
function buildLivingHingeLidGeometry(
  model: GeneratedBoxModel,
  spec: Panel3DTransform
): THREE.BufferGeometry {
  const { params, innerDims } = model;
  const innerW = innerDims.widthMm;
  const innerD = innerDims.depthMm;
  const innerH = innerDims.heightMm;
  const T = spec.thicknessMm;
  const wFull = innerW + 2 * T;
  const attachMode = params.livingHingeAttachMode || 'one-piece-back';
  const hasSideArchTabs = attachMode === 'side-arch-tabs';

  const bendRadius = Math.max(
    10,
    Math.min(innerH * 0.42, innerD * 0.35, innerH - 15)
  );
  const straightH = Math.max(15, innerH - bendRadius);
  const topFlatD = Math.max(10, innerD - 2 * bendRadius);
  const frontLipH = Math.min(14, straightH * 0.38);
  const seamY = -innerH / 2 + straightH;
  const pitch = Math.max(1.8, params.livingHingePitchMm);

  const parts: THREE.BufferGeometry[] = [];

  // 1. Flat Top Deck (spans X in [-wFull/2 .. +wFull/2], Z in [-topFlatD/2 .. +topFlatD/2], Y in [innerH/2 .. innerH/2 + T])
  if (hasSideArchTabs) {
    const sideTabW = Math.min(16, Math.max(6, topFlatD * 0.45));
    const deckShape = new THREE.Shape([
      new THREE.Vector2(-wFull / 2, -topFlatD / 2),
      new THREE.Vector2(wFull / 2, -topFlatD / 2),
      new THREE.Vector2(wFull / 2, topFlatD / 2),
      new THREE.Vector2(-wFull / 2, topFlatD / 2),
    ]);
    for (const xSign of [-1, 1]) {
      const x0 = xSign === -1 ? -wFull / 2 + 0.4 : wFull / 2 - T;
      const x1 = xSign === -1 ? -wFull / 2 + T : wFull / 2 - 0.4;
      deckShape.holes.push(
        new THREE.Path([
          new THREE.Vector2(x0, -sideTabW / 2),
          new THREE.Vector2(x0, sideTabW / 2),
          new THREE.Vector2(x1, sideTabW / 2),
          new THREE.Vector2(x1, -sideTabW / 2),
        ])
      );
    }
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

  // 2. Helper to build a 90° Curved Living-Hinge Zone with kerf-separated ribs AND alternating uncut wood bridges
  //    plus end-collars so the curve is 100% physically connected from end to end!
  const arcLength = (Math.PI * bendRadius) / 2;
  const numRibs = Math.max(8, Math.min(28, Math.round(arcLength / pitch)));
  const rMid = bendRadius + T / 2;
  const dTheta = Math.PI / 2 / numRibs;
  const stepArcLen = rMid * dTheta;
  const ribArcLen = Math.max(0.8, stepArcLen * 0.72);
  const bridgeArcLen = stepArcLen * 1.12;
  const bridgeW = 4.5;

  const addCurvedHingeZone = (isFront: boolean) => {
    const zCenter = isFront ? innerD / 2 - bendRadius : -innerD / 2 + bendRadius;
    const yCenter = seamY;
    const zSign = isFront ? 1 : -1;

    // End-collars at phi = 0 (meeting Top Deck) and phi = PI/2 (meeting Back Wall or Front Lip)
    const topCollar = new THREE.BoxGeometry(wFull, T, stepArcLen * 0.65);
    topCollar.translate(0, innerH / 2 + T / 2, zCenter);
    parts.push(topCollar);

    const botCollar = new THREE.BoxGeometry(wFull, stepArcLen * 0.65, T);
    botCollar.translate(0, seamY, zCenter + zSign * rMid);
    parts.push(botCollar);

    for (let i = 0; i < numRibs; i++) {
      // Angle phi measured from the top vertical (+Y) down toward +Z (front) or -Z (back)
      const phi = (i + 0.5) * dTheta;
      const ribY = yCenter + Math.cos(phi) * rMid;
      const ribZ = zCenter + zSign * Math.sin(phi) * rMid;

      const ribGeom = new THREE.BoxGeometry(wFull, T, ribArcLen);
      ribGeom.rotateX(zSign * phi);
      ribGeom.translate(0, ribY, ribZ);
      parts.push(ribGeom);

      // Uncut alternating wood bridges across the kerf slit between rib i and rib i+1
      const bridgePhi = (i + 1) * dTheta;
      if (i < numRibs - 1) {
        const bY = yCenter + Math.cos(bridgePhi) * rMid;
        const bZ = zCenter + zSign * Math.sin(bridgePhi) * rMid;
        const bridgeXs =
          i % 2 === 0
            ? [-wFull / 2 + bridgeW / 2, 0, wFull / 2 - bridgeW / 2]
            : [-wFull / 6, wFull / 6];
        for (const bx of bridgeXs) {
          const bGeom = new THREE.BoxGeometry(bridgeW, T, bridgeArcLen);
          bGeom.rotateX(zSign * bridgePhi);
          bGeom.translate(bx, bY, bZ);
          parts.push(bGeom);
        }
      }
    }
  };

  addCurvedHingeZone(false); // Rear 90° living hinge bend
  addCurvedHingeZone(true); // Front 90° living hinge bend

  // 3. Front Overhang Lip + Front Catch Tongue (which slots into the Lower Front Wall catch cutout)
  const frontLip = new THREE.BoxGeometry(wFull, frontLipH, T);
  frontLip.translate(0, seamY - frontLipH / 2, innerD / 2 + T / 2);
  parts.push(frontLip);

  const catchW = Math.min(24, Math.max(10, innerW * 0.24));
  const catchTab = new THREE.BoxGeometry(catchW, T, T * 1.4);
  catchTab.translate(0, seamY - frontLipH + T * 0.6, innerD / 2);
  parts.push(catchTab);

  // 4. Integrated Lower Back Wall (for 1-piece modes) OR Rear Finger-Jointed Edge (for 2-piece finger-joint-back mode)
  //    Welded directly to the bottom of the rear 90° living-hinge curve at Y = seamY, Z in [-(innerD/2 + T) .. -innerD/2]!
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
    parts.push(rearWallGeom);
  } else {
    const rearAnchor = new THREE.BoxGeometry(wFull, T * 1.5, T);
    rearAnchor.translate(0, seamY - T * 0.25, -innerD / 2 - T / 2);
    parts.push(rearAnchor);
  }

  return mergeBufferGeometries(parts);
}

function mergeBufferGeometries(
  geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const nonIndexed = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of nonIndexed) {
    totalVerts += g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;

  for (const g of nonIndexed) {
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    positions.set(pos.array as Float32Array, offset * 3);
    if (norm) {
      normals.set(norm.array as Float32Array, offset * 3);
    }
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}
