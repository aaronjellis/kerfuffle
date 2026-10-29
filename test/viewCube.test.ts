import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cellDir,
  cubeTransform,
  dirName,
  faceViewOffset,
  quarterTurnOffset,
  viewOffset,
  type CubeDir,
  type CubeFace,
} from '../src/components/ViewCube';

/** Where the camera sees a world direction, in CSS screen space (y down, z toward the viewer). */
const onScreen = (camera: THREE.Camera, world: THREE.Vector3) => {
  const m = new THREE.Matrix4().fromArray(
    cubeTransform(camera.quaternion).replace(/^matrix3d\(|\)$/g, '').split(',').map(Number)
  );
  // The cube's own CSS space flips y, the same as the screen's.
  return new THREE.Vector3(world.x, -world.y, world.z).applyMatrix4(m);
};

const cameraAt = (offset: THREE.Vector3) => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
};

describe('view cube', () => {
  const normals: Record<CubeFace, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0, 1),
    back: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    left: new THREE.Vector3(-1, 0, 0),
    top: new THREE.Vector3(0, 1, 0),
    bottom: new THREE.Vector3(0, -1, 0),
  };

  it('keeps the distance and looks straight at each side', () => {
    for (const face of Object.keys(normals) as CubeFace[]) {
      const offset = faceViewOffset(face, 300);
      expect(offset.length()).toBeCloseTo(300, 6);
      expect(offset.clone().normalize().dot(normals[face])).toBeCloseTo(1, 6);
    }
  });

  it('turns the picked side toward the viewer', () => {
    for (const face of Object.keys(normals) as CubeFace[]) {
      const seen = onScreen(cameraAt(faceViewOffset(face, 300)), normals[face]);
      expect(seen.z).toBeCloseTo(1, 3);
    }
  });

  it('shows the top above the front from a raised front view', () => {
    const camera = cameraAt(new THREE.Vector3(0, 100, 300));
    expect(onScreen(camera, normals.top).y).toBeLessThan(0);
    expect(onScreen(camera, normals.right).x).toBeCloseTo(1, 6);
  });

  it('puts the front at the bottom of the top view', () => {
    expect(onScreen(cameraAt(faceViewOffset('top', 300)), normals.front).y).toBeCloseTo(1, 3);
  });

  it('views a corner along its diagonal, keeping the distance', () => {
    const offset = viewOffset([1, 1, 1], 300);
    expect(offset.length()).toBeCloseTo(300, 6);
    expect(offset.x).toBeCloseTo(offset.y, 6);
    expect(offset.y).toBeCloseTo(offset.z, 6);
    // All three sides show equally.
    const camera = cameraAt(offset);
    for (const n of [normals.front, normals.right, normals.top]) {
      expect(onScreen(camera, n).z).toBeCloseTo(1 / Math.sqrt(3), 3);
    }
  });

  it("names each grid cell by the side, edge or corner it sits on", () => {
    // The front's top-right cell: the front's right is +x and its down is -y.
    const dir: CubeDir = cellDir([0, 0, 1], [1, 0, 0], [0, -1, 0], 1, -1);
    expect(dir).toEqual([1, 1, 1]);
    expect(dirName(dir)).toBe('top front right corner');
    expect(dirName(cellDir([0, 0, 1], [1, 0, 0], [0, -1, 0], 0, 1))).toBe('bottom front edge');
    expect(dirName([0, 0, -1])).toBe('back');
  });

  it('quarter turns bring the next side round to face the viewer', () => {
    const front = faceViewOffset('front', 300);
    const toLeft = quarterTurnOffset(front, 'left');
    expect(toLeft.clone().normalize().dot(normals.left)).toBeCloseTo(1, 6);
    expect(quarterTurnOffset(front, 'right').clone().normalize().dot(normals.right)).toBeCloseTo(1, 6);
    const up = quarterTurnOffset(front, 'up');
    expect(up.clone().normalize().dot(normals.top)).toBeCloseTo(1, 3);
    expect(up.length()).toBeCloseTo(300, 6);
    // Another turn up stops at the top rather than flipping over.
    expect(quarterTurnOffset(up, 'up').clone().normalize().dot(normals.top)).toBeCloseTo(1, 3);
    expect(quarterTurnOffset(front, 'down').clone().normalize().dot(normals.bottom)).toBeCloseTo(1, 3);
  });
});
