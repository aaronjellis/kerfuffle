import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cubeTransform, faceViewOffset, type CubeFace } from '../src/components/ViewCube';

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
});
