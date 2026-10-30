import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { containRect, imageAspect } from '../engine/artworkImage';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FaceArtwork,
  GeneratedBoxModel,
  Panel3DTransform,
} from '../engine/types';
import { livingHingeZoneCuts, wrapBendRadiusMm } from '../engine/fingerJointEngine';
import { buildPrintPartWorldGeometry } from '../engine/printWorld';
import type { PrintPartId } from '../engine/printParts';
import { partForMesh, type PartId } from '../ui/parts';
import { meshPartIdFor } from '../ui/meshParts';
import { CubeDir, QuarterTurn, ViewCube, cubeTransform, quarterTurnOffset, viewOffset } from './ViewCube';

interface Viewport3DProps {
  model: GeneratedBoxModel;
  artworks: FaceArtwork[];
  assemblyProgress: number; // 0 = flat/exploded, 1 = closed/assembled
  selectedFaceId: string;
  onSelectFace: (faceId: string) => void;
  /** The open inspector part; every mesh that maps to it glows with `accent`. */
  selectedPart: PartId | null;
  /** Called with the clicked mesh's part id (or its face id); `partForMesh` resolves it. */
  onSelectPart: (meshPartId: string) => void;
  /** The selection highlight color. */
  accent: string;
  showWireframe: boolean;
  /** The scene's clear color; the stage passes its own so the canvas and the stage match. */
  background?: string;
}

const DEFAULT_BACKGROUND = '#0f141c';
const EDGE_COLOR = '#452c16';
const EDGES_NAME = 'panel-edges';
const LID_CUTS_NAME = 'lid-cuts';
/** How long a view cube pick takes to swing the camera round. */
const VIEW_TURN_MS = 450;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type PanelEntry = {
  wrapper: THREE.Group;
  /** One mesh per panel; the 3D box has one per print piece group. */
  meshes: THREE.Mesh[];
  spec: Panel3DTransform;
};

export const Viewport3D: React.FC<Viewport3DProps> = ({
  model,
  artworks,
  assemblyProgress,
  selectedFaceId,
  onSelectFace,
  selectedPart,
  onSelectPart,
  accent,
  showWireframe,
  background = DEFAULT_BACKGROUND,
}) => {
  // The click handler is bound once; read the latest callbacks through a ref.
  const callbacksRef = useRef({ onSelectFace, onSelectPart });
  callbacksRef.current = { onSelectFace, onSelectPart };
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxGroupRef = useRef<THREE.Group | null>(null);
  const panelMeshesRef = useRef<Map<string, PanelEntry>>(new Map());
  const cubeBodyRef = useRef<HTMLDivElement>(null);
  // The view cube's handlers need the camera and controls, which the init effect creates.
  const cubeActionsRef = useRef<{
    orbit: (dx: number, dy: number) => void;
    pickView: (dir: CubeDir) => void;
    quarterTurn: (turn: QuarterTurn) => void;
  }>();

  // 1. Initialize Three.js Scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);
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
      panelMeshesRef.current.forEach((v) => meshes.push(...v.meshes));
      const hits = raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.faceId) {
          obj = obj.parent;
        }
        if (obj?.userData?.faceId) {
          const { faceId, partId } = obj.userData as { faceId: string; partId?: string };
          callbacksRef.current.onSelectFace(faceId);
          callbacksRef.current.onSelectPart(partId ?? faceId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // A view cube pick swings the camera's direction round the target, keeping its distance.
    let turn: { from: THREE.Vector3; spin: THREE.Quaternion; distance: number; start: number } | null =
      null;
    const cancelTurn = () => {
      turn = null;
    };
    controls.addEventListener('start', cancelTurn);

    const placeCamera = (offset: THREE.Vector3) => {
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
    };

    /** Swings the camera, at its distance, to the offset `goalFor` gives; at once under reduced motion. */
    const turnTo = (goalFor: (distance: number, offset: THREE.Vector3) => THREE.Vector3) => {
      // Spend any coasting from the last drag now, so it doesn't pull the camera off the view.
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      const offset = camera.position.clone().sub(controls.target);
      const distance = offset.length();
      const goal = goalFor(distance, offset);
      if (prefersReducedMotion()) {
        turn = null;
        placeCamera(goal);
        return;
      }
      const from = offset.normalize();
      turn = {
        from,
        spin: new THREE.Quaternion().setFromUnitVectors(from, goal.clone().normalize()),
        distance,
        start: performance.now(),
      };
    };

    cubeActionsRef.current = {
      // The same turn per pixel as OrbitControls, so the cube drags like the scene.
      orbit: (dx, dy) => {
        turn = null;
        const spherical = new THREE.Spherical().setFromVector3(
          camera.position.clone().sub(controls.target)
        );
        const height = Math.max(1, renderer.domElement.clientHeight);
        spherical.theta -= ((2 * Math.PI * dx) / height) * controls.rotateSpeed;
        spherical.phi -= ((2 * Math.PI * dy) / height) * controls.rotateSpeed;
        spherical.makeSafe();
        placeCamera(new THREE.Vector3().setFromSpherical(spherical));
      },
      pickView: (dir) => turnTo((distance) => viewOffset(dir, distance)),
      quarterTurn: (quarter) => turnTo((_, offset) => quarterTurnOffset(offset, quarter)),
    };

    const noSpin = new THREE.Quaternion();
    let cubeTransformShown = '';
    let animFrameId = 0;
    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      if (turn) {
        const t = Math.min(1, (performance.now() - turn.start) / VIEW_TURN_MS);
        const ease = t * t * (3 - 2 * t);
        const step = noSpin.clone().slerp(turn.spin, ease);
        placeCamera(turn.from.clone().applyQuaternion(step).multiplyScalar(turn.distance));
        if (t === 1) turn = null;
      }
      controls.update();
      renderer.render(scene, camera);
      const cubeBody = cubeBodyRef.current;
      if (cubeBody) {
        const transform = cubeTransform(camera.quaternion);
        if (transform !== cubeTransformShown) {
          cubeBody.style.transform = transform;
          cubeTransformShown = transform;
        }
      }
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
      controls.removeEventListener('start', cancelTurn);
      cubeActionsRef.current = undefined;
      boxGroup.children.forEach(disposeObject);
      disposeObject(grid);
      controls.dispose();
      renderer.dispose();
      // Frees the WebGL context now, not at garbage collection; Chrome warns after about 16 live contexts.
      renderer.forceContextLoss();
    };
  }, []);

  // The clear color can change after the scene exists.
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(background);
  }, [background]);

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

    // Clear the previous wrappers, freeing their GPU geometry, materials and decal textures.
    while (boxGroup.children.length > 0) {
      const child = boxGroup.children[0];
      boxGroup.remove(child);
      disposeObject(child);
    }
    panelMeshesRef.current.clear();

    const isPrint = model.params.category === '3d-print';

    for (const spec of model.panels3D) {
      const wrapper = new THREE.Group();
      const faceArts = artworks.filter(
        (a) => a.faceId === spec.faceId || a.faceId === spec.id
      );
      const makeMaterial = () =>
        new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: isPrint ? 0.35 : 0.72,
          metalness: isPrint ? 0.12 : 0.04,
          // Wireframe mode draws feature edges only (below); the surface then writes depth
          // but no colour, so hidden edges stay hidden instead of every triangle showing.
          colorWrite: !showWireframe,
        });

      if (isPrint) {
        // One mesh per print piece group (shell, lip, hinge, clasp), already placed in the
        // world frame; the shared wrapper keeps them moving together.
        const pieces = buildPrintPartWorldGeometry(model, spec.id === '3d-lid' ? 'lid' : 'base');
        const groups = new Map<PrintPartId, THREE.BufferGeometry[]>();
        for (const p of pieces) {
          const list = groups.get(p.partId) ?? [];
          list.push(p.geometry);
          groups.set(p.partId, list);
        }
        const meshes: THREE.Mesh[] = [];
        groups.forEach((geoms, partId) => {
          const geometry = mergeBufferGeometries(geoms);
          const mesh = new THREE.Mesh(geometry, makeMaterial());
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { faceId: spec.faceId, panelId: spec.id, partId };
          // Outlines show only while the piece is selected.
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry, 30),
            new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.95 })
          );
          edges.name = EDGES_NAME;
          edges.visible = false;
          mesh.add(edges);
          wrapper.add(mesh);
          meshes.push(mesh);
        });
        boxGroup.add(wrapper);
        panelMeshesRef.current.set(spec.id, { wrapper, meshes, spec });
        continue;
      }

      let geometry: THREE.BufferGeometry;
      if (spec.id === 'living-hinge-lid') {
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

      const mesh = new THREE.Mesh(geometry, makeMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        faceId: spec.faceId,
        panelId: spec.id,
        partId: meshPartIdFor(spec, model.params),
      };

      // Dark laser-charred edge highlight for wood & cardboard panels
      const edgeLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 20),
        new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.65 })
      );
      edgeLines.name = EDGES_NAME;
      mesh.add(edgeLines);

      // Render user SVG / PNG Artwork decals directly onto the 3D panel face!
      if (faceArts.length > 0) {
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

      if (spec.id === 'living-hinge-lid') mesh.add(buildLivingHingeCutLines(model, spec));
      if (spec.surfaceLines?.length) mesh.add(buildSurfaceLines(spec));

      wrapper.add(mesh);
      boxGroup.add(wrapper);
      panelMeshesRef.current.set(spec.id, { wrapper, meshes: [mesh], spec });
    }

    applyAssemblyTransform(panelMeshesRef.current, assemblyProgress, model);
  }, [model, artworks, showWireframe]);

  // 2b. Highlight the selected part (or, for Artwork, the selected face) without rebuilding.
  //     Runs after 2 so freshly built meshes pick up the current selection.
  useEffect(() => {
    const templateId = model.params.templateId;
    panelMeshesRef.current.forEach(({ meshes, spec }) => {
      for (const mesh of meshes) {
        const { partId, faceId } = mesh.userData as { partId?: string; faceId: string };
        const on =
          selectedPart === 'artwork'
            ? spec.faceId === selectedFaceId || spec.id === selectedFaceId
            : selectedPart !== null && partForMesh(partId ?? faceId, templateId) === selectedPart;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.set(on ? accent : '#000000');
        mat.emissiveIntensity = on ? 0.22 : 0;
        const edges = mesh.getObjectByName(EDGES_NAME) as THREE.LineSegments | undefined;
        if (edges) {
          const edgeMat = edges.material as THREE.LineBasicMaterial;
          if (showWireframe) {
            edges.visible = true;
            edgeMat.color.set(on ? accent : spec.color);
            edgeMat.opacity = on ? 1 : 0.9;
          } else if (model.params.category === '3d-print') {
            edges.visible = on;
            edgeMat.color.set(accent);
          } else {
            edgeMat.color.set(on ? accent : EDGE_COLOR);
            edgeMat.opacity = on ? 0.95 : 0.65;
          }
        }
      }
    });
  }, [model, artworks, showWireframe, selectedPart, selectedFaceId, accent]);

  // 3. Smoothly update panel positions/rotations when assemblyProgress slider moves
  useEffect(() => {
    applyAssemblyTransform(panelMeshesRef.current, assemblyProgress, model);
  }, [assemblyProgress, model]);

  // The cube sits beside the canvas, not over it, so its taps never reach the panel picking.
  return (
    <>
      <div ref={containerRef} className="viewport-3d-canvas" />
      <ViewCube
        bodyRef={cubeBodyRef}
        onOrbit={(dx, dy) => cubeActionsRef.current?.orbit(dx, dy)}
        onPickView={(dir) => cubeActionsRef.current?.pickView(dir)}
        onQuarterTurn={(quarter) => cubeActionsRef.current?.quarterTurn(quarter)}
      />
    </>
  );
};

/** Frees the GPU resources under an object: geometries, materials and their texture maps. */
function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const drawable = obj as THREE.Mesh | THREE.LineSegments;
    if (!(drawable instanceof THREE.Mesh || drawable instanceof THREE.LineSegments)) return;
    drawable.geometry.dispose();
    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    for (const mat of materials) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
  });
}

function applyAssemblyTransform(
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
        // Fitted inside its box at its own shape, as the 2D sheet and the SVG export draw it.
        const aspect = imageAspect(img, art.dataUrl);
        const fit = aspect ? containRect(w, h, aspect) : { x: 0, y: 0, w, h };
        ctx.drawImage(img, -w / 2 + fit.x, -h / 2 + fit.y, fit.w, fit.h);
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

/**
 * The living-hinge wrap's two bends at `bend` radians each (π/2 closed, 0 laid flat), the top deck
 * held still. Each bend keeps its flat zone's arc length on its inner face, so straightening it
 * rolls the lip and the back wall out along the curve the way the sheet really unrolls.
 */
function wrapBend(model: GeneratedBoxModel, bend: number) {
  const innerD = model.innerDims.depthMm;
  const innerH = model.innerDims.heightMm;
  const closedR = wrapBendRadiusMm(innerD, innerH);
  const arcLength = (Math.PI * closedR) / 2;
  const deckY = innerH / 2;
  const deckEdge = innerD / 2 - closedR;
  const flat = bend < 1e-4;
  const r = flat ? Infinity : arcLength / bend;
  /** [y, z] of the point `s` along the bend's inner face from the deck, `d` out from it. */
  const at = (isFront: boolean, s: number, d: number): [number, number] => {
    const zSign = isFront ? 1 : -1;
    if (flat) return [deckY + d, zSign * (deckEdge + s)];
    const phi = s / r;
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
function buildLivingHingeLidGeometry(
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
  const hasSideArchTabs = attachMode === 'side-arch-tabs';

  const bendRadius = wrapBendRadiusMm(innerD, innerH);
  const straightH = Math.max(15, innerH - bendRadius);
  const topFlatD = Math.max(10, innerD - 2 * bendRadius);
  const frontLipH = Math.min(14, straightH * 0.38);
  const seamY = -innerH / 2 + straightH;
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

  const catchW = Math.min(24, Math.max(10, innerW * 0.24));
  // The catch tongue hangs one thickness below the lip, in its plane, into the front wall's notch.
  const catchTab = new THREE.BoxGeometry(catchW, T, T);
  catchTab.translate(0, seamY - frontLipH - T / 2, innerD / 2 + T / 2);
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
function buildLivingHingeCutLines(
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
function bendLivingHingeLid(mesh: THREE.Mesh, model: GeneratedBoxModel, spec: Panel3DTransform, bend: number) {
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
function buildSurfaceLines(spec: Panel3DTransform): THREE.LineSegments {
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
