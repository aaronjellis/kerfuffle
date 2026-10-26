import * as THREE from 'three';
import { fmt } from './fingerJointEngine';

/**
 * Serializes geometries to one ASCII STL solid. Handles indexed and non-indexed geometry. Facet
 * normals come from each triangle (winding order), not from the geometry's normal attribute.
 */
export function geometriesToAsciiStl(name: string, geometries: THREE.BufferGeometry[]): string {
  const lines: string[] = [`solid ${name}`];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  for (const source of geometries) {
    const geom = source.index ? source.toNonIndexed() : source;
    const pos = geom.attributes.position;
    for (let i = 0; i + 2 < pos.count; i += 3) {
      vA.fromBufferAttribute(pos, i);
      vB.fromBufferAttribute(pos, i + 1);
      vC.fromBufferAttribute(pos, i + 2);
      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab).normalize();
      lines.push(`  facet normal ${fmt(cb.x)} ${fmt(cb.y)} ${fmt(cb.z)}`);
      lines.push('    outer loop');
      lines.push(`      vertex ${fmt(vA.x)} ${fmt(vA.y)} ${fmt(vA.z)}`);
      lines.push(`      vertex ${fmt(vB.x)} ${fmt(vB.y)} ${fmt(vB.z)}`);
      lines.push(`      vertex ${fmt(vC.x)} ${fmt(vC.y)} ${fmt(vC.z)}`);
      lines.push('    endloop');
      lines.push('  endfacet');
    }
  }

  lines.push(`endsolid ${name}`);
  return lines.join('\n');
}
