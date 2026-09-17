import * as THREE from 'three';
import { softenArrises } from './arris';
import { createTimberMaterial, type GrainDirection, type GrainStyle } from './timberMaterial';
import { profileBounds, type Point2, type ProfileLoops } from './profileSolid';

/** Edges meeting at less than this angle are smoothed (sampled arcs); sharper arrises stay crisp. */
const CREASE_ANGLE = (32 * Math.PI) / 180;

export function createTimberMesh(
  loops: ProfileLoops,
  length: number,
  grain: GrainStyle = 'flat',
  primed = false,
  direction: GrainDirection = 'long'
): THREE.Mesh {
  const bounds = profileBounds(loops);
  const arris = Math.min(1.0, 0.05 * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
  const outer = softenArrises(loops.outer, arris);
  const holes = loops.holes.map((hole) => softenArrises(hole, arris));

  const geometry = extrudeProfile(outer, holes, length);
  geometry.translate(-bounds.cx, -bounds.minY, -length / 2);
  geometry.setAttribute('uv', grainUvs(geometry, direction));

  const mesh = new THREE.Mesh(geometry, createTimberMaterial(loops, length, grain, primed, direction));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Extrude the profile along +Z from 0 to `length`, building the side walls with normals
 * weighted by segment length. That is the 2D form of face-area-weighted normals: where a
 * long flat face meets the first short chord of a fillet, the shared vertex keeps the flat
 * face's normal, so the face shades perfectly flat and the round starts exactly where the
 * geometry does. Between equal chords the weighted normal is the exact radial direction, so a
 * sampled arc shades as a true cylinder. A plain average (what `toCreasedNormals` gives)
 * tilts the flat face's edge normals by half the chord angle and smears a shading gradient
 * across the whole face, which is what made the arrises read as soft chamfers.
 *
 * Loops must have the solid on their left: outer counter-clockwise, holes clockwise.
 */
function extrudeProfile(outer: Point2[], holes: Point2[][], length: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const loop of [outer, ...holes]) {
    addSideWalls(loop, length, positions, normals, indices);
  }
  addCaps(outer, holes, length, positions, normals, indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function addSideWalls(loop: Point2[], length: number, positions: number[], normals: number[], indices: number[]): void {
  const count = loop.length;
  if (count < 3) return;

  // Outward normal and length of each segment i -> i + 1.
  const segNx = new Float64Array(count);
  const segNy = new Float64Array(count);
  const segLen = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % count];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segLen[i] = len;
    if (len > 0) {
      segNx[i] = dy / len;
      segNy[i] = -dx / len;
    }
  }

  // Vertex normal at the start of segment i (shared with the end of segment i - 1) and at
  // its end (shared with the start of segment i + 1). Hard where the turn exceeds the crease
  // angle, otherwise the length-weighted blend of the two segment normals.
  const blend = (prev: number, next: number): [number, number] => {
    const dot = segNx[prev] * segNx[next] + segNy[prev] * segNy[next];
    if (Math.acos(Math.min(1, Math.max(-1, dot))) > CREASE_ANGLE) return [NaN, NaN];
    const nx = segNx[prev] * segLen[prev] + segNx[next] * segLen[next];
    const ny = segNy[prev] * segLen[prev] + segNy[next] * segLen[next];
    const len = Math.hypot(nx, ny);
    return len > 0 ? [nx / len, ny / len] : [NaN, NaN];
  };

  for (let i = 0; i < count; i++) {
    if (segLen[i] <= 0) continue;
    const prev = (i + count - 1) % count;
    const next = (i + 1) % count;
    const a = loop[i];
    const b = loop[next];

    let [sx, sy] = blend(prev, i);
    if (Number.isNaN(sx)) [sx, sy] = [segNx[i], segNy[i]];
    let [ex, ey] = blend(i, next);
    if (Number.isNaN(ex)) [ex, ey] = [segNx[i], segNy[i]];

    const base = positions.length / 3;
    positions.push(a.x, a.y, 0, b.x, b.y, 0, b.x, b.y, length, a.x, a.y, length);
    normals.push(sx, sy, 0, ex, ey, 0, ex, ey, 0, sx, sy, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function addCaps(outer: Point2[], holes: Point2[][], length: number, positions: number[], normals: number[], indices: number[]): void {
  const toVec = (p: Point2) => new THREE.Vector2(p.x, p.y);
  const contour = outer.map(toVec);
  const holeContours = holes.map((hole) => hole.map(toVec));
  const flat = [...contour, ...holeContours.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(contour, holeContours);

  for (const [z, nz] of [
    [length, 1],
    [0, -1],
  ] as const) {
    const base = positions.length / 3;
    for (const p of flat) {
      positions.push(p.x, p.y, z);
      normals.push(0, 0, nz);
    }
    for (const [a, b, c] of faces) {
      // Earcut's winding is not guaranteed; orient every triangle to face out of its cap.
      const pa = flat[a];
      const pb = flat[b];
      const pc = flat[c];
      const area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
      if (area * nz >= 0) indices.push(base + a, base + b, base + c);
      else indices.push(base + a, base + c, base + b);
    }
  }
}

/**
 * UVs exist only to give the anisotropic highlight a tangent frame: u runs along the fibres
 * on faces that follow the grain, and across the faces where those fibres are cut.
 */
function grainUvs(geometry: THREE.BufferGeometry, direction: GrainDirection): THREE.BufferAttribute {
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const cross = direction === 'cross';
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    if (cross) {
      if (Math.abs(nx) > 0.7) {
        uv[i * 2] = z * 0.01;
        uv[i * 2 + 1] = y * 0.01;
      } else {
        uv[i * 2] = x * 0.01;
        uv[i * 2 + 1] = (y * -nz + z * ny) * 0.01;
      }
    } else if (Math.abs(nz) > 0.7) {
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
