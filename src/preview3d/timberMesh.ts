import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { softenArrises } from './arris';
import { createTimberMaterial } from './timberMaterial';
import { profileBounds, type ProfileLoops } from './profileSolid';

/** Edges meeting at less than this angle are smoothed (sampled arcs); sharper arrises stay crisp. */
const CREASE_ANGLE = (32 * Math.PI) / 180;

export function createTimberMesh(loops: ProfileLoops, length: number): THREE.Mesh {
  const bounds = profileBounds(loops);
  const arris = Math.min(1.0, 0.05 * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
  const toVec = (point: { x: number; y: number }) => new THREE.Vector2(point.x, point.y);
  const shape = new THREE.Shape(softenArrises(loops.outer, arris).map(toVec));
  for (const hole of loops.holes) {
    shape.holes.push(new THREE.Path(softenArrises(hole, arris).map(toVec)));
  }

  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  const geometry = toCreasedNormals(extruded, CREASE_ANGLE);
  extruded.dispose();
  geometry.translate(-bounds.cx, -bounds.minY, -length / 2);
  geometry.setAttribute('uv', grainUvs(geometry));

  const mesh = new THREE.Mesh(geometry, createTimberMaterial(loops));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * UVs exist only to give the anisotropic highlight a tangent frame: u runs along the grain
 * (the length) on every long face, and across the end caps where the fibres are cut.
 */
function grainUvs(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    if (Math.abs(nz) > 0.7) {
      uv[i * 2] = x * 0.01;
      uv[i * 2 + 1] = y * 0.01;
    } else {
      // In-plane direction perpendicular to the length for v, so the frame is never degenerate.
      uv[i * 2] = z * 0.01;
      uv[i * 2 + 1] = (x * -ny + y * nx) * 0.01;
    }
  }
  return new THREE.BufferAttribute(uv, 2);
}

export function disposeTimberMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.dispose();
}
