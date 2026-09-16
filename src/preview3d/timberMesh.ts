import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { softenArrises } from './arris';
import { createTimberMaterial } from './timberMaterial';
import { profileBounds, type ProfileLoops } from './profileSolid';

/** Edges meeting at less than this angle are smoothed (sampled arcs); sharper arrises stay crisp. */
const CREASE_ANGLE = (32 * Math.PI) / 180;

export function createTimberMesh(loops: ProfileLoops, length: number): THREE.Mesh {
  const bounds = profileBounds(loops);
  const arris = Math.min(0.8, 0.04 * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
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
  geometry.deleteAttribute('uv');
  geometry.translate(-bounds.cx, -bounds.minY, -length / 2);

  return new THREE.Mesh(geometry, createTimberMaterial(loops));
}

export function disposeTimberMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.dispose();
}
