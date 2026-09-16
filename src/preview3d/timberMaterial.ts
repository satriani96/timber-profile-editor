import * as THREE from 'three';
import type { ProfileLoops } from './profileSolid';
import { profileBounds } from './profileSolid';

const TEXTURE_SIZE = 512;
const GRAIN_MM = 42;

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function paintLongGrain(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const rand = rng(0x71b3e11d);
  const image = ctx.createImageData(w, h);
  const data = image.data;

  const bands = Array.from({ length: 28 }, () => ({
    y: rand() * h,
    width: 6 + rand() * 18,
    dark: 0.08 + rand() * 0.22,
  }));

  for (let y = 0; y < h; y++) {
    let latewood = 0;
    for (const band of bands) {
      const d = Math.abs(y - band.y);
      latewood = Math.max(latewood, Math.max(0, 1 - d / band.width) * band.dark);
    }
    const wave = 0.04 * Math.sin(y * 0.11) + 0.03 * Math.sin(y * 0.37 + 1.2);
    for (let x = 0; x < w; x++) {
      const streak = 0.08 * Math.sin(x * 0.05 + y * 0.012) + (rand() - 0.5) * 0.1;
      const t = Math.min(1, latewood * 1.35 + wave + streak);
      const r = mix(210, 118, t);
      const g = mix(162, 78, t);
      const b = mix(98, 38, t);
      const i = (y * w + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function paintEndGrain(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const rand = rng(0x51a40c27);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const pithX = w * 0.38;
  const pithY = h * 0.62;
  const ringNoise = Array.from({ length: 64 }, () => rand() * 0.35);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - pithX;
      const dy = y - pithY;
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const wobble = ringNoise[Math.floor(((angle + Math.PI) / (Math.PI * 2)) * ringNoise.length) % ringNoise.length];
      const rings = 0.5 + 0.5 * Math.sin(radius * 0.22 + wobble * 4 + Math.sin(angle * 2) * 0.4);
      const ray = 0.08 * Math.pow(Math.max(0, Math.cos(angle * 14 + radius * 0.01)), 8);
      const pore = (rand() - 0.5) * 0.06;
      const t = rings * 0.55 + ray + pore;
      const r = mix(204, 136, t);
      const g = mix(160, 90, t);
      const b = mix(102, 48, t);
      const i = (y * w + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function canvasTexture(paint: (ctx: CanvasRenderingContext2D) => void, wrap: THREE.Wrapping): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a timber texture.');
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.needsUpdate = true;
  return texture;
}

let cached: { side: THREE.CanvasTexture; cap: THREE.CanvasTexture } | null = null;

export function getTimberTextures(): { side: THREE.CanvasTexture; cap: THREE.CanvasTexture } {
  if (cached) return cached;
  cached = {
    side: canvasTexture(paintLongGrain, THREE.RepeatWrapping),
    cap: canvasTexture(paintEndGrain, THREE.ClampToEdgeWrapping),
  };
  return cached;
}

export function createTimberMaterials(): [THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial] {
  const { side, cap } = getTimberTextures();
  const sideMat = new THREE.MeshPhysicalMaterial({
    map: side,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    sheen: 0.12,
    sheenColor: new THREE.Color('#c4a06a'),
  });
  const capMat = new THREE.MeshPhysicalMaterial({
    map: cap,
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.7,
  });
  return [sideMat, capMat];
}

function faceNormalZ(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  a: number,
  b: number,
  c: number
): { nx: number; ny: number; nz: number } {
  const abx = pos.getX(b) - pos.getX(a);
  const aby = pos.getY(b) - pos.getY(a);
  const abz = pos.getZ(b) - pos.getZ(a);
  const acx = pos.getX(c) - pos.getX(a);
  const acy = pos.getY(c) - pos.getY(a);
  const acz = pos.getZ(c) - pos.getZ(a);
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

export function assignTimberGroupsAndUVs(geometry: THREE.BufferGeometry, loops: ProfileLoops): void {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const bounds = profileBounds(loops);
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);

  const triangles: number[][] = [];
  if (index) {
    for (let i = 0; i < index.count; i += 3) triangles.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
  } else {
    for (let i = 0; i < pos.count; i += 3) triangles.push([i, i + 1, i + 2]);
  }

  const sidePos: number[] = [];
  const capPos: number[] = [];
  const sideNrm: number[] = [];
  const capNrm: number[] = [];
  const sideUv: number[] = [];
  const capUv: number[] = [];

  const write = (
    targetPos: number[],
    targetNrm: number[],
    targetUv: number[],
    i: number,
    nx: number,
    ny: number,
    nz: number,
    cap: boolean
  ) => {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    targetPos.push(x, y, z);
    targetNrm.push(nx, ny, nz);
    if (cap) targetUv.push((x - bounds.cx) / size + 0.5, (y - bounds.cy) / size + 0.5);
    else targetUv.push(z / GRAIN_MM, (x * -ny + y * nx) / GRAIN_MM);
  };

  for (const [a, b, c] of triangles) {
    const { nx, ny, nz } = faceNormalZ(pos, a, b, c);
    const cap = Math.abs(nz) > 0.5;
    const p = cap ? capPos : sidePos;
    const n = cap ? capNrm : sideNrm;
    const u = cap ? capUv : sideUv;
    write(p, n, u, a, nx, ny, nz, cap);
    write(p, n, u, b, nx, ny, nz, cap);
    write(p, n, u, c, nx, ny, nz, cap);
  }

  const positions = new Float32Array(sidePos.length + capPos.length);
  positions.set(sidePos, 0);
  positions.set(capPos, sidePos.length);
  const normals = new Float32Array(sideNrm.length + capNrm.length);
  normals.set(sideNrm, 0);
  normals.set(capNrm, sideNrm.length);
  const uvs = new Float32Array(sideUv.length + capUv.length);
  uvs.set(sideUv, 0);
  uvs.set(capUv, sideUv.length);

  geometry.setIndex(null);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.clearGroups();
  geometry.addGroup(0, sidePos.length / 3, 0);
  geometry.addGroup(sidePos.length / 3, capPos.length / 3, 1);
}
