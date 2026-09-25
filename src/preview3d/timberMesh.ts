import * as THREE from 'three';
import { softenArrises } from './arris';
import { createTimberMaterial, type GrainDirection, type GrainStyle } from './timberMaterial';
import { DEFAULT_FINISH, FINISHES, type Finish } from './finishes';
import { profileBounds, type Point2, type ProfileLoops } from './profileSolid';

/** Edges meeting at less than this angle are smoothed (sampled arcs); sharper arrises stay crisp. */
const CREASE_ANGLE = (32 * Math.PI) / 180;
/** Facets across the quarter round where each face turns into the docked end. */
const END_ROUND_STEPS = 4;

export function createTimberMesh(
  loops: ProfileLoops,
  length: number,
  grain: GrainStyle = 'flat',
  finish: Finish = FINISHES[DEFAULT_FINISH],
  direction: GrainDirection = 'long'
): THREE.Mesh {
  const bounds = profileBounds(loops);
  // Dressed timber carries about a 2 mm round on the arrises of a board and proportionally
  // less on a small moulding. Under-rounding them is what makes an edge read as a drawn white
  // line: the highlight has to land on a band wide enough to fall off across several pixels.
  const arris = Math.min(2.0, 0.06 * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
  const outer = softenArrises(loops.outer, arris);
  const holes = loops.holes.map((hole) => softenArrises(hole, arris));
  // A docked end is sharp, but not a perfect 90 degrees: the saw breaks the corner by a
  // fraction of a millimetre, and that sliver is what catches a thin line of light between
  // the face and the end. A mathematically sharp edge has no highlight and reads as CG.
  const endRound = Math.min(0.8, arris);

  const geometry = extrudeProfile(outer, holes, length, endRound);
  geometry.translate(-bounds.cx, -bounds.minY, -length / 2);
  geometry.setAttribute('uv', grainUvs(geometry));

  const mesh = new THREE.Mesh(geometry, createTimberMaterial(loops, length, grain, finish, direction));
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
 * Each wall turns into the end caps through a quarter round of radius `endRound`, so the caps
 * are the profile inset by that radius.
 *
 * Loops must have the solid on their left: outer counter-clockwise, holes clockwise.
 */
function extrudeProfile(outer: Point2[], holes: Point2[][], length: number, endRound: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const loop of [outer, ...holes]) {
    addSideWalls(loop, length, endRound, positions, normals, indices);
  }
  addCaps(insetLoop(outer, endRound), holes.map((hole) => insetLoop(hole, endRound)), length, positions, normals, indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

interface LoopSegments {
  /** Outward normal and length of each segment i -> i + 1; zero-length segments have a zero normal. */
  nx: Float64Array;
  ny: Float64Array;
  len: Float64Array;
}

function loopSegments(loop: Point2[]): LoopSegments {
  const count = loop.length;
  const nx = new Float64Array(count);
  const ny = new Float64Array(count);
  const len = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % count];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    len[i] = l;
    if (l > 0) {
      nx[i] = dy / l;
      ny[i] = -dx / l;
    }
  }
  return { nx, ny, len };
}

/**
 * Per-vertex mitred offset that moves the loop outwards by one unit, measured square to each
 * adjacent segment. Positions are shared by the segments either side of a vertex, so the end
 * round stays watertight even across a hard corner, where the segment normals differ. The mitre
 * is capped at 3 units: past that the corner is so acute the offset would cross the other face.
 */
function mitreOffsets(loop: Point2[], seg: LoopSegments): Float64Array {
  const count = loop.length;
  const out = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    let prev = (i + count - 1) % count;
    while (seg.len[prev] === 0) prev = (prev + count - 1) % count;
    let next = i;
    while (seg.len[next] === 0) next = (next + 1) % count;
    const bx = seg.nx[prev] + seg.nx[next];
    const by = seg.ny[prev] + seg.ny[next];
    const bl = Math.hypot(bx, by);
    const mx = bx / bl;
    const my = by / bl;
    const scale = Math.min(3, 1 / (mx * seg.nx[next] + my * seg.ny[next]));
    out[i * 2] = mx * scale;
    out[i * 2 + 1] = my * scale;
  }
  return out;
}

/** The loop moved into the solid by `distance`: where the end round meets the cap. */
function insetLoop(loop: Point2[], distance: number): Point2[] {
  const mitre = mitreOffsets(loop, loopSegments(loop));
  return loop.map((p, i) => ({ x: p.x - mitre[i * 2] * distance, y: p.y - mitre[i * 2 + 1] * distance }));
}

function addSideWalls(
  loop: Point2[],
  length: number,
  endRound: number,
  positions: number[],
  normals: number[],
  indices: number[]
): void {
  const count = loop.length;
  if (count < 3) return;

  const seg = loopSegments(loop);
  const segNx = seg.nx;
  const segNy = seg.ny;
  const segLen = seg.len;
  const mitre = mitreOffsets(loop, seg);

  // Rows along the length: the quarter round off the near cap (z = 0), the flat run of the
  // face, and the quarter round onto the far cap. Each row is [inset, z, nz]: how far the edge
  // has turned in from the face, its height, and the normal's lean towards the cap.
  const rows: [number, number, number][] = [];
  for (let k = END_ROUND_STEPS; k >= 0; k--) {
    const angle = (k / END_ROUND_STEPS) * (Math.PI / 2);
    rows.push([endRound * (1 - Math.cos(angle)), endRound * (1 - Math.sin(angle)), -Math.sin(angle)]);
  }
  for (let k = 0; k <= END_ROUND_STEPS; k++) {
    const angle = (k / END_ROUND_STEPS) * (Math.PI / 2);
    rows.push([endRound * (1 - Math.cos(angle)), length - endRound * (1 - Math.sin(angle)), Math.sin(angle)]);
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
    for (const [inset, z, nz] of rows) {
      const side = Math.sqrt(1 - nz * nz);
      positions.push(
        a.x - mitre[i * 2] * inset,
        a.y - mitre[i * 2 + 1] * inset,
        z,
        b.x - mitre[next * 2] * inset,
        b.y - mitre[next * 2 + 1] * inset,
        z
      );
      normals.push(sx * side, sy * side, nz, ex * side, ey * side, nz);
    }
    for (let r = 0; r < rows.length - 1; r++) {
      const lo = base + r * 2;
      const hi = lo + 2;
      indices.push(lo, lo + 1, hi + 1, lo, hi + 1, hi);
    }
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
 * UVs exist only to give the anisotropic highlight a tangent frame. Fibres follow the log,
 * which follows the extrusion, on both the long and the cross cut.
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
    // Only the caps proper take the end-grain frame; the end rounds keep the fibre along z.
    if (Math.abs(nz) > 0.999) {
      uv[i * 2] = x * 0.01;
      uv[i * 2 + 1] = y * 0.01;
    } else {
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
