import type { DxfBlock, DxfDocument, DxfEntity, DxfPoint, DxfVertex } from './dxfParser';

export type ViewPlane = 'auto' | 'xy' | 'xz' | 'yz';
export type ResolvedPlane = 'xy' | 'xz' | 'yz';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export const WORLD_Z: Vec3 = { x: 0, y: 0, z: 1 };

const OCS_AXIS_THRESHOLD = 1 / 64;
const FLAT_RATIO = 0.15;

export const PLANE_LABELS: Record<ResolvedPlane, string> = {
  xy: 'Top (XY)',
  xz: 'Front (XZ)',
  yz: 'Side (YZ)',
};

export function planeNote(plane: ResolvedPlane, auto: boolean): string {
  const label = PLANE_LABELS[plane];
  if (plane === 'xy') {
    return auto ? `View: ${label}.` : `View forced to ${label}.`;
  }
  return auto
    ? `Drawing lies in the ${plane.toUpperCase()} plane — showing ${label} so the profile is visible.`
    : `View forced to ${label}.`;
}

export function vec3(p: DxfPoint): Vec3 {
  return { x: p.x, y: p.y, z: p.z };
}

export function asPoint(p: Vec2, z = 0): DxfPoint {
  return { x: p.x, y: p.y, z };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-15) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * AutoCAD Arbitrary Axis Algorithm: OCS (x, y, z) → WCS given extrusion N.
 * @see DXF reference, “OCS”
 */
export function ocsToWcs(point: Vec3, extrusion: Vec3): Vec3 {
  const n = normalize(extrusion);
  if (n.x === 0 && n.y === 0 && n.z === 0) return point;
  if (Math.abs(n.x) < 1e-12 && Math.abs(n.y) < 1e-12 && n.z > 0.999999) return point;
  const ax = normalize(
    Math.abs(n.x) < OCS_AXIS_THRESHOLD && Math.abs(n.y) < OCS_AXIS_THRESHOLD
      ? cross({ x: 0, y: 1, z: 0 }, n)
      : cross({ x: 0, y: 0, z: 1 }, n)
  );
  const ay = cross(n, ax);
  return {
    x: ax.x * point.x + ay.x * point.y + n.x * point.z,
    y: ax.y * point.x + ay.y * point.y + n.y * point.z,
    z: ax.z * point.x + ay.z * point.y + n.z * point.z,
  };
}

export function projectToPlane(point: Vec3, plane: ResolvedPlane): Vec2 {
  switch (plane) {
    case 'xy':
      return { x: point.x, y: point.y };
    case 'xz':
      return { x: point.x, y: point.z };
    case 'yz':
      return { x: point.y, y: point.z };
  }
}

export function detectViewPlane(points: Vec3[]): ResolvedPlane {
  if (points.length === 0) return 'xy';
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  const rx = maxX - minX;
  const ry = maxY - minY;
  const rz = maxZ - minZ;
  const span = Math.max(rx, ry, rz, 1e-12);
  const nx = rx / span;
  const ny = ry / span;
  const nz = rz / span;
  if (Math.min(nx, ny, nz) > FLAT_RATIO) return 'xy';
  if (nz <= nx && nz <= ny) return 'xy';
  if (ny <= nx && ny <= nz) return 'xz';
  return 'yz';
}

export function resolveViewPlane(points: Vec3[], requested: ViewPlane): ResolvedPlane {
  if (requested !== 'auto') return requested;
  return detectViewPlane(points);
}

export function applyInsert(point: Vec3, insert: Extract<DxfEntity, { type: 'INSERT' }>, base: Vec3): Vec3 {
  const local = {
    x: (point.x - base.x) * insert.scale.x,
    y: (point.y - base.y) * insert.scale.y,
    z: (point.z - base.z) * insert.scale.z,
  };
  const rad = (insert.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotated = { x: local.x * cos - local.y * sin, y: local.x * sin + local.y * cos, z: local.z };
  return ocsToWcs(
    { x: rotated.x + insert.position.x, y: rotated.y + insert.position.y, z: rotated.z + insert.position.z },
    insert.extrusion
  );
}

function findBlock(blocks: Record<string, DxfBlock>, name: string): DxfBlock | undefined {
  if (blocks[name]) return blocks[name];
  const lower = name.toLowerCase();
  return Object.values(blocks).find((block) => block.name.toLowerCase() === lower);
}

function entityWcsPoints(entity: DxfEntity, xform: (p: Vec3) => Vec3): Vec3[] {
  const add = (p: Vec3) => xform(p);
  switch (entity.type) {
    case 'LINE':
      return [add(vec3(entity.start)), add(vec3(entity.end))];
    case 'CIRCLE':
    case 'ARC': {
      const n = entity.extrusion;
      const c = entity.center;
      const r = entity.radius;
      return [
        add(ocsToWcs(vec3(c), n)),
        add(ocsToWcs({ x: c.x + r, y: c.y, z: c.z }, n)),
        add(ocsToWcs({ x: c.x, y: c.y + r, z: c.z }, n)),
      ];
    }
    case 'POLYLINE':
      return entity.vertices.map((v) => add(entity.ocs ? ocsToWcs(vec3(v), entity.extrusion) : vec3(v)));
    case 'SPLINE':
      return [...entity.controlPoints, ...entity.fitPoints].map((p) => add(vec3(p)));
    case 'ELLIPSE': {
      const c = vec3(entity.center);
      const major = vec3(entity.majorAxis);
      return [add(c), add({ x: c.x + major.x, y: c.y + major.y, z: c.z + major.z })];
    }
    default:
      return [];
  }
}

function collectWcsPoints(
  entities: DxfEntity[],
  blocks: Record<string, DxfBlock>,
  xform: (p: Vec3) => Vec3,
  depth: number,
  out: Vec3[]
) {
  if (depth > 8) return;
  for (const entity of entities) {
    if (entity.type === 'INSERT') {
      const block = findBlock(blocks, entity.name);
      if (!block) continue;
      collectWcsPoints(block.entities, blocks, (p) => xform(applyInsert(p, entity, vec3(block.base))), depth + 1, out);
      continue;
    }
    out.push(...entityWcsPoints(entity, xform));
  }
}

function bulgeFromThree(from: Vec2, through: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return 0;
  const nx = dy / chord;
  const ny = -dx / chord;
  const signed = (through.x - (from.x + to.x) / 2) * nx + (through.y - (from.y + to.y) / 2) * ny;
  return (2 * signed) / chord;
}

function angleDeg(origin: Vec2, point: Vec2): number {
  return (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI;
}

function onCcwSweep(start: number, end: number, mid: number): boolean {
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const s = norm(start);
  const e = norm(end);
  const m = norm(mid);
  if (s <= e) return m >= s && m <= e;
  return m >= s || m <= e;
}

function ocsRim(center: DxfPoint, radius: number, angleDegValue: number): Vec3 {
  const rad = (angleDegValue * Math.PI) / 180;
  return { x: center.x + Math.cos(rad) * radius, y: center.y + Math.sin(rad) * radius, z: center.z };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function projectEntity(entity: DxfEntity, plane: ResolvedPlane, xform: (p: Vec3) => Vec3): DxfEntity | null {
  const layer = entity.layer;
  const extrusion = WORLD_Z;
  const P = (p: Vec3) => projectToPlane(xform(p), plane);

  switch (entity.type) {
    case 'LINE': {
      const start = P(vec3(entity.start));
      const end = P(vec3(entity.end));
      if (dist(start, end) < 1e-12) return null;
      return { type: 'LINE', start: asPoint(start), end: asPoint(end), layer, extrusion };
    }
    case 'CIRCLE': {
      const n = entity.extrusion;
      const center = P(ocsToWcs(vec3(entity.center), n));
      const p0 = P(ocsToWcs(ocsRim(entity.center, entity.radius, 0), n));
      const p90 = P(ocsToWcs(ocsRim(entity.center, entity.radius, 90), n));
      const r0 = dist(center, p0);
      const r90 = dist(center, p90);
      if (r0 < 1e-9 && r90 < 1e-9) return null;
      if (Math.abs(r0 - r90) <= Math.max(r0, r90) * 0.02 + 1e-6) {
        return { type: 'CIRCLE', center: asPoint(center), radius: (r0 + r90) / 2, layer, extrusion };
      }
      const a = Math.max(r0, r90);
      const b = Math.min(r0, r90);
      if (b < 1e-9) {
        const far = r0 >= r90 ? p0 : p90;
        return {
          type: 'LINE',
          start: asPoint({ x: 2 * center.x - far.x, y: 2 * center.y - far.y }),
          end: asPoint(far),
          layer,
          extrusion,
        };
      }
      const major = r0 >= r90 ? { x: p0.x - center.x, y: p0.y - center.y } : { x: p90.x - center.x, y: p90.y - center.y };
      return {
        type: 'ELLIPSE',
        center: asPoint(center),
        majorAxis: asPoint(major),
        ratio: b / a,
        startParam: 0,
        endParam: Math.PI * 2,
        layer,
        extrusion,
      };
    }
    case 'ARC': {
      const n = entity.extrusion;
      let sweep = ((entity.endAngle - entity.startAngle) % 360 + 360) % 360;
      if (sweep === 0) sweep = 360;
      const center = P(ocsToWcs(vec3(entity.center), n));
      const start = P(ocsToWcs(ocsRim(entity.center, entity.radius, entity.startAngle), n));
      const mid = P(ocsToWcs(ocsRim(entity.center, entity.radius, entity.startAngle + sweep / 2), n));
      const end = P(ocsToWcs(ocsRim(entity.center, entity.radius, entity.startAngle + sweep), n));
      const radius = dist(center, start);
      if (radius < 1e-9) return null;
      const midRadius = dist(center, mid);
      const endRadius = dist(center, end);
      const circular = Math.abs(radius - midRadius) <= radius * 0.05 + 1e-6 && Math.abs(radius - endRadius) <= radius * 0.05 + 1e-6;
      if (!circular) {
        if (dist(start, end) < 1e-9) return null;
        return { type: 'LINE', start: asPoint(start), end: asPoint(end), layer, extrusion };
      }
      let startAngle = angleDeg(center, start);
      let endAngle = angleDeg(center, end);
      const midAngle = angleDeg(center, mid);
      if (sweep < 360 - 1e-6 && !onCcwSweep(startAngle, endAngle, midAngle)) {
        const swap = startAngle;
        startAngle = endAngle;
        endAngle = swap;
      }
      if (sweep >= 360 - 1e-6) {
        return { type: 'CIRCLE', center: asPoint(center), radius, layer, extrusion };
      }
      return { type: 'ARC', center: asPoint(center), radius, startAngle, endAngle, layer, extrusion };
    }
    case 'POLYLINE': {
      const vertices: DxfVertex[] = [];
      for (let i = 0; i < entity.vertices.length; i++) {
        const v = entity.vertices[i];
        const wcs = entity.ocs ? ocsToWcs(vec3(v), entity.extrusion) : vec3(v);
        const p = P(wcs);
        let bulge = 0;
        if (v.bulge !== 0) {
          const next = entity.vertices[(i + 1) % entity.vertices.length];
          if (i + 1 < entity.vertices.length || entity.closed) {
            const from = { x: v.x, y: v.y };
            const to = { x: next.x, y: next.y };
            const throughOcs = bulgeThrough(from, to, v.bulge);
            const throughWcs = entity.ocs
              ? ocsToWcs({ x: throughOcs.x, y: throughOcs.y, z: v.z }, entity.extrusion)
              : { x: throughOcs.x, y: throughOcs.y, z: v.z };
            const nextWcs = entity.ocs ? ocsToWcs(vec3(next), entity.extrusion) : vec3(next);
            bulge = bulgeFromThree(p, P(throughWcs), P(nextWcs));
          }
        }
        vertices.push({ ...asPoint(p, 0), bulge });
      }
      return { type: 'POLYLINE', vertices, closed: entity.closed, ocs: true, layer, extrusion };
    }
    case 'SPLINE':
      return {
        type: 'SPLINE',
        degree: entity.degree,
        closed: entity.closed,
        controlPoints: entity.controlPoints.map((p) => asPoint(P(vec3(p)))),
        fitPoints: entity.fitPoints.map((p) => asPoint(P(vec3(p)))),
        knots: entity.knots,
        layer,
        extrusion,
      };
    case 'ELLIPSE': {
      const c = vec3(entity.center);
      const major = vec3(entity.majorAxis);
      const n = normalize(entity.extrusion);
      const minorLen = Math.hypot(major.x, major.y, major.z) * entity.ratio;
      const minor = scale(normalize(cross(n, major)), minorLen);
      const center = P(c);
      const pMajor = P({ x: c.x + major.x, y: c.y + major.y, z: c.z + major.z });
      const pMinor = P({ x: c.x + minor.x, y: c.y + minor.y, z: c.z + minor.z });
      const a = dist(center, pMajor);
      const b = dist(center, pMinor);
      if (a < 1e-9) return null;
      return {
        type: 'ELLIPSE',
        center: asPoint(center),
        majorAxis: asPoint({ x: pMajor.x - center.x, y: pMajor.y - center.y }),
        ratio: b / a,
        startParam: entity.startParam,
        endParam: entity.endParam,
        layer,
        extrusion,
      };
    }
    default:
      return null;
  }
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function bulgeThrough(from: Vec2, to: Vec2, bulge: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const sagitta = (Math.abs(bulge) * chord) / 2;
  const sign = Math.sign(bulge) || 1;
  const nx = dy / chord;
  const ny = -dx / chord;
  return { x: from.x + dx / 2 + nx * sagitta * sign, y: from.y + dy / 2 + ny * sagitta * sign };
}

function flattenEntities(
  entities: DxfEntity[],
  blocks: Record<string, DxfBlock>,
  plane: ResolvedPlane,
  xform: (p: Vec3) => Vec3,
  depth: number,
  skipped: Record<string, number>
): DxfEntity[] {
  if (depth > 8) {
    skipped['INSERT (nested too deeply)'] = (skipped['INSERT (nested too deeply)'] ?? 0) + 1;
    return [];
  }
  const out: DxfEntity[] = [];
  for (const entity of entities) {
    if (entity.type === 'INSERT') {
      const block = findBlock(blocks, entity.name);
      if (!block) {
        skipped[`INSERT (missing block "${entity.name}")`] = (skipped[`INSERT (missing block "${entity.name}")`] ?? 0) + 1;
        continue;
      }
      if (entity.scale.x === 0 || entity.scale.y === 0) {
        skipped['INSERT (zero scale)'] = (skipped['INSERT (zero scale)'] ?? 0) + 1;
        continue;
      }
      out.push(
        ...flattenEntities(block.entities, blocks, plane, (p) => xform(applyInsert(p, entity, vec3(block.base))), depth + 1, skipped)
      );
      continue;
    }
    const flat = projectEntity(entity, plane, xform);
    if (flat) out.push(flat);
  }
  return out;
}

export function flattenDxfDocument(
  doc: DxfDocument,
  requested: ViewPlane = 'auto'
): { doc: DxfDocument; plane: ResolvedPlane; planeNote: string } {
  const points: Vec3[] = [];
  collectWcsPoints(doc.entities, doc.blocks, (p) => p, 0, points);
  const plane = resolveViewPlane(points, requested);
  const skipped: Record<string, number> = {};
  const entities = flattenEntities(doc.entities, doc.blocks, plane, (p) => p, 0, skipped);
  return {
    plane,
    planeNote: planeNote(plane, requested === 'auto'),
    doc: {
      entities,
      blocks: {},
      insUnits: doc.insUnits,
      unsupported: { ...doc.unsupported, ...skipped },
      layers: doc.layers,
    },
  };
}
