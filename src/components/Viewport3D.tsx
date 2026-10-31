import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { containRect, imageAspect } from '../engine/artworkImage';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FaceArtwork,
  GeneratedBoxModel,
  Panel3DTransform,
} from '../engine/types';
import {
  EDGE_COLOR,
  EDGES_NAME,
  applyAssemblyTransform,
  buildLivingHingeCutLines,
  buildLivingHingeLidGeometry,
  buildSurfaceLines,
  mergeBufferGeometries,
  type PanelEntry,
} from '../engine/scene3d';
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
/** How long a view cube pick takes to swing the camera round. */
const VIEW_TURN_MS = 450;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;


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
