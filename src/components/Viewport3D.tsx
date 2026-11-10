import { buildBentLines, panelEdgesGeometry, panelGeometryFor } from '../engine/bentPanel';
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
import { computePrintBoxDims } from '../engine/printParts';
import { floorWorldY, interiorToWorld, worldToInterior } from '../engine/dividerPick';
import type { DividerPreview } from '../engine/printDividers';
import type { DividerEditing } from '../ui/useDividerEditing';
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
  /** The printed box's divider tools: place on the floor, drag a divider, with the lid out of the way. */
  dividerEditing?: DividerEditing | null;
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
  dividerEditing = null,
}) => {
  // The click handler is bound once; read the latest callbacks through a ref.
  const callbacksRef = useRef({ onSelectFace, onSelectPart });
  callbacksRef.current = { onSelectFace, onSelectPart };
  // The pointer handlers are bound once too; they read the divider tools and the box here.
  const dividerRef = useRef<DividerEditing | null>(dividerEditing);
  dividerRef.current = dividerEditing;
  const modelRef = useRef(model);
  modelRef.current = model;
  /** The translucent divider that follows the pointer across the floor. */
  const ghostRef = useRef<THREE.Mesh | null>(null);
  /** The divider under the pointer, lit before a drag can move it. */
  const hoverDividerRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  /** The box type the camera was last framed for. */
  const framedTemplateRef = useRef<string | null>(null);
  const boxGroupRef = useRef<THREE.Group | null>(null);
  const panelMeshesRef = useRef<Map<string, PanelEntry>>(new Map());
  const cubeBodyRef = useRef<HTMLDivElement>(null);
  // The view cube's handlers need the camera and controls, which the init effect creates.
  /** Lights the hovered and the selected divider over whatever glow the open section gives them. */
  const applyDividerLook = () => {
    const selected = dividerRef.current?.selectedId ?? null;
    for (const mesh of panelMeshesRef.current.get('3d-base')?.meshes ?? []) {
      const id = mesh.userData.dividerId as string | undefined;
      if (!id) continue;
      const lit = id === selected || id === hoverDividerRef.current;
      const glow = lit ? 0.8 : mesh.userData.baseGlow ? 0.22 : 0;
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        mat.emissive.set(glow > 0 ? accent : '#000000');
        mat.emissiveIntensity = glow;
      }
    }
  };
  const dividerLookRef = useRef(applyDividerLook);
  dividerLookRef.current = applyDividerLook;
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

    const setRay = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
    };

    // ---- The divider tools (3D-printed box) ----
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.45, depthWrite: false })
    );
    ghost.visible = false;
    ghostRef.current = ghost;
    let dragDividerId: string | null = null;
    const toLocal = new THREE.Matrix4();
    const floorHit = new THREE.Vector3();

    const printDims = () => {
      const m = modelRef.current;
      if (m.params.category !== '3d-print') return null;
      return computePrintBoxDims(m.params, m.innerDims.widthMm, m.innerDims.depthMm, m.innerDims.heightMm);
    };
    /** The divider the pointer is on, nearest first. */
    const dividerUnder = (e: PointerEvent): string | null => {
      const meshes = (panelMeshesRef.current.get('3d-base')?.meshes ?? []).filter((m) => m.userData.dividerId);
      if (meshes.length === 0) return null;
      setRay(e);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      return hit ? (hit.object.userData.dividerId as string) : null;
    };
    /** Where the pointer meets the base's floor, in the dividers' interior frame. */
    const floorPoint = (e: PointerEvent): { x: number; y: number } | null => {
      const base = panelMeshesRef.current.get('3d-base');
      const dims = printDims();
      if (!base || !dims) return null;
      setRay(e);
      // The base moves when the box is exploded; meet the floor in the base's own frame.
      base.wrapper.updateWorldMatrix(true, false);
      const ray = raycaster.ray.clone().applyMatrix4(toLocal.copy(base.wrapper.matrixWorld).invert());
      const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorWorldY(dims)), floorHit);
      return hit ? worldToInterior(dims, hit) : null;
    };
    const showGhost = (preview: DividerPreview | null) => {
      const ed = dividerRef.current;
      const dims = printDims();
      if (!preview || !ed || !dims) {
        ghost.visible = false;
        return;
      }
      const g = preview.divider;
      const mid = (g.from + g.to) / 2;
      const length = g.to - g.from;
      const at = interiorToWorld(dims, g.axis === 'y' ? { x: g.pos, y: mid } : { x: mid, y: g.pos });
      ghost.scale.set(g.axis === 'y' ? ed.space.t : length, ed.heightMm, g.axis === 'y' ? length : ed.space.t);
      ghost.position.set(at.x, floorWorldY(dims) + ed.heightMm / 2, at.z);
      ghost.visible = true;
    };
    const setHover = (id: string | null) => {
      if (hoverDividerRef.current === id) return;
      hoverDividerRef.current = id;
      dividerLookRef.current();
    };

    // A press on a divider starts a slide and never reaches the orbit controls: this listener
    // runs in the capture phase, ahead of theirs. A press anywhere else orbits as usual.
    const onDividerDown = (e: PointerEvent) => {
      const ed = dividerRef.current;
      if (!ed || !ed.tool || e.button !== 0) return;
      const id = dividerUnder(e);
      if (!id) return;
      e.stopImmediatePropagation();
      dragDividerId = id;
      setHover(id);
      showGhost(null);
      ed.beginDrag(id);
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone.
      }
    };
    const onDividerMove = (e: PointerEvent) => {
      const ed = dividerRef.current;
      if (!ed || !ed.tool) return;
      if (dragDividerId) {
        const p = floorPoint(e);
        const d = ed.layout.find((x) => x.id === dragDividerId);
        if (p && d) ed.dragTo(d.axis === 'y' ? p.x : p.y);
        return;
      }
      // Touch has no hover, and a held button is an orbit in progress.
      if (e.pointerType === 'touch' || e.buttons !== 0) {
        showGhost(null);
        return;
      }
      const over = dividerUnder(e);
      setHover(over);
      renderer.domElement.style.cursor = over ? 'grab' : ed.tool === 'place' ? 'crosshair' : '';
      const p = over || ed.tool !== 'place' ? null : floorPoint(e);
      showGhost(p ? ed.preview(p) : null);
    };
    const endDividerDrag = () => {
      dragDividerId = null;
    };
    const onDividerLeave = () => {
      if (dragDividerId) return;
      setHover(null);
      showGhost(null);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dragDividerId) {
        dragDividerId = null;
        return;
      }
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const ed = dividerRef.current;
      if (ed?.tool) {
        // With a divider tool on, a click places or selects a divider, not a part.
        const id = dividerUnder(e);
        if (id) ed.select(id);
        else if (ed.tool === 'place') {
          const p = floorPoint(e);
          if (p) ed.place(p);
        } else ed.select(null);
        showGhost(null);
        return;
      }
      setRay(e);
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

    renderer.domElement.addEventListener('pointerdown', onDividerDown, { capture: true });
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onDividerMove);
    renderer.domElement.addEventListener('pointercancel', endDividerDrag);
    renderer.domElement.addEventListener('pointerleave', onDividerLeave);

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
      renderer.domElement.removeEventListener('pointerdown', onDividerDown, { capture: true });
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onDividerMove);
      renderer.domElement.removeEventListener('pointercancel', endDividerDrag);
      renderer.domElement.removeEventListener('pointerleave', onDividerLeave);
      ghost.removeFromParent();
      disposeObject(ghost);
      ghostRef.current = null;
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

    // A new box type that wouldn't fit the view (the wine carrier is twice a box's height) pulls the
    // camera back along its line of sight; changing a size afterwards leaves the camera be.
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls && framedTemplateRef.current !== model.params.templateId) {
      framedTemplateRef.current = model.params.templateId;
      const tallest = Math.max(model.outerDims.widthMm, model.outerDims.depthMm, model.outerDims.heightMm);
      const offset = camera.position.clone().sub(controls.target);
      const fit = (0.75 * tallest) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      if (offset.length() < fit) {
        camera.position.copy(controls.target).add(offset.setLength(fit));
        controls.update();
      }
    }

    // Position grid right under the bottom of the box
    const grid = scene.getObjectByName('studio-grid');
    if (grid) {
      grid.position.y = -model.outerDims.heightMm / 2 - 4;
    }

    // The divider preview rides on the base's wrapper; lift it off before the wrappers go.
    ghostRef.current?.removeFromParent();
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
      // Bought brass butt hinges look like brass, not like a cut part.
      const brass = spec.id.startsWith('butt-hinge-');
      const makeMaterial = () =>
        new THREE.MeshStandardMaterial({
          color: brass ? '#c9a24e' : spec.color,
          roughness: brass ? 0.38 : isPrint ? 0.35 : 0.72,
          metalness: brass ? 0.65 : isPrint ? 0.12 : 0.04,
          envMapIntensity: brass ? 2.5 : 1,
          // Wireframe mode draws feature edges only (below); the surface then writes depth
          // but no colour, so hidden edges stay hidden instead of every triangle showing.
          colorWrite: !showWireframe,
        });
      /** The laser's charred edge: the part's wood, darker and duller. */
      const makeBurntMaterial = () =>
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(spec.color).multiplyScalar(0.45),
          roughness: 0.9,
          metalness: 0,
          colorWrite: !showWireframe,
        });

      if (isPrint) {
        // One mesh per print piece group (shell, lip, hinge, clasp), already placed in the
        // world frame; the shared wrapper keeps them moving together.
        const pieces = buildPrintPartWorldGeometry(model, spec.id === '3d-lid' ? 'lid' : 'base');
        const groups = new Map<PrintPartId, THREE.BufferGeometry[]>();
        for (const p of pieces) {
          if (p.dividerId) continue;
          const list = groups.get(p.partId) ?? [];
          list.push(p.geometry);
          groups.set(p.partId, list);
        }
        const meshes: THREE.Mesh[] = [];
        const addPrintMesh = (geometry: THREE.BufferGeometry, partId: PrintPartId, dividerId?: string) => {
          const mesh = new THREE.Mesh(geometry, makeMaterial());
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { faceId: spec.faceId, panelId: spec.id, partId, ...(dividerId ? { dividerId } : {}) };
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
        };
        groups.forEach((geoms, partId) => addPrintMesh(mergeBufferGeometries(geoms), partId));
        // Each divider is a mesh of its own, so the pointer can tell them apart.
        for (const p of pieces) if (p.dividerId) addPrintMesh(p.geometry, p.partId, p.dividerId);
        boxGroup.add(wrapper);
        panelMeshesRef.current.set(spec.id, { wrapper, meshes, spec });
        continue;
      }

      let geometry: THREE.BufferGeometry;
      // An extruded wood part draws its cut edges (outline and holes) darker, as the laser burns
      // them: a hole then reads as a hole even where the lit inside of the box shows through it.
      let burntEdges = false;
      const bent = panelGeometryFor(spec);
      if (bent) {
        geometry = bent;
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
        burntEdges = !brass;
      } else {
        geometry = new THREE.BoxGeometry(spec.widthMm, spec.heightMm, spec.thicknessMm);
      }

      // ExtrudeGeometry puts its faces in group 0 and its sides in group 1.
      const mesh = new THREE.Mesh(geometry, burntEdges ? [makeMaterial(), makeBurntMaterial()] : makeMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        faceId: spec.faceId,
        panelId: spec.id,
        partId: meshPartIdFor(spec, model.params),
      };

      // Dark laser-charred edge highlight for wood & cardboard panels
      // The wine carrier's tabbed walls draw their own edges (see panelEdgesGeometry).
      const ownEdges = spec.bend || model.params.templateId === 'finger-wine-carrier';
      const edgeLines = new THREE.LineSegments(
        ownEdges ? panelEdgesGeometry(spec) : new THREE.EdgesGeometry(geometry, 20),
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
      if (spec.bend?.lines?.length) mesh.add(buildBentLines(spec, spec.bend.lines));
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
        mesh.userData.baseGlow = on;
        for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
          mat.emissive.set(on ? accent : '#000000');
          mat.emissiveIntensity = on ? 0.22 : 0;
        }
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

  // 2c. The divider tools: the lid steps aside while one is on, the preview rides on the base, and
  //     the selected divider stays lit. After 2 and 2b, so rebuilt meshes pick all of it up.
  const dividerToolOn = !!dividerEditing?.tool;
  const selectedDividerId = dividerEditing?.selectedId ?? null;
  useEffect(() => {
    const lid = panelMeshesRef.current.get('3d-lid');
    if (lid) lid.wrapper.visible = !dividerToolOn;
    const ghost = ghostRef.current;
    const base = panelMeshesRef.current.get('3d-base');
    if (ghost) {
      if (base) base.wrapper.add(ghost);
      if (!dividerToolOn || !base) ghost.visible = false;
    }
    if (!dividerToolOn) {
      hoverDividerRef.current = null;
      if (rendererRef.current) rendererRef.current.domElement.style.cursor = '';
    }
    dividerLookRef.current();
  }, [dividerToolOn, selectedDividerId, model, artworks, showWireframe, selectedPart, selectedFaceId, accent]);

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
