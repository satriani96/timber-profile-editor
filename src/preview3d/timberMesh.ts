import * as THREE from 'three';
import { assignTimberGroupsAndUVs, createTimberMaterials } from './timberMaterial';
import { profileBounds, type ProfileLoops } from './profileSolid';

export function createTimberMesh(loops: ProfileLoops, length: number): THREE.Mesh {
  const shape = new THREE.Shape(loops.outer.map((point) => new THREE.Vector2(point.x, point.y)));
  for (const hole of loops.holes) {
    shape.holes.push(new THREE.Path(hole.map((point) => new THREE.Vector2(point.x, point.y))));
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.computeVertexNormals();
  assignTimberGroupsAndUVs(geometry, loops);

  const bounds = profileBounds(loops);
  geometry.translate(-bounds.cx, -bounds.minY, -length / 2);

  const materials = createTimberMaterials();
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function disposeTimberMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.dispose();
}
