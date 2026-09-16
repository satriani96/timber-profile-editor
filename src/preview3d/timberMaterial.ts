import * as THREE from 'three';
import { profileBounds, type ProfileLoops } from './profileSolid';

/**
 * Solid (3D) procedural clear-pine material.
 *
 * Instead of wrapping a flat picture around the extrusion, the shader models the log the
 * sample was cut from: concentric growth rings around a pith that sits above the piece,
 * distorted by low-frequency noise, with fine fibres running along the log. Because
 * the grain is evaluated in 3D at every surface point, end grain shows the ring arcs,
 * faces show cathedral figure where the profile cuts the rings, and the two always match.
 * Long grain follows the extrusion; cross grain rotates that log axis 90°.
 */

const RING_MM = 7.0;

/**
 * How the sample was cut from the log. Only the pith position and the noise seed change, so
 * the three looks share one shader.
 */
export type GrainStyle = 'crown' | 'flat' | 'quarter';

/** Fibre direction relative to the extrusion. Independent of the sawn cut. */
export type GrainDirection = 'long' | 'cross';

const GRAIN_STYLES: Record<GrainStyle, { pithFactor: number; pithLift: number; seed: THREE.Vector3 }> = {
  // Pith close to the face: big sweeping cathedrals.
  crown: { pithFactor: 0.65, pithLift: 0.6, seed: new THREE.Vector3(0, 0, 0) },
  // Typical flat-sawn board: a few flame bands with straighter grain between them.
  flat: { pithFactor: 1.15, pithLift: 0.75, seed: new THREE.Vector3(37, 91, 410) },
  // Pith far away: near-parallel lines, the quiet quarter-sawn look.
  quarter: { pithFactor: 3.2, pithLift: 0.9, seed: new THREE.Vector3(120, 55, 830) },
};

const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
// Value noise with quintic (C2) interpolation: on faces that run almost tangent to the rings a
// tiny kink in the noise is magnified into a visible step in the figure, so C1 is not enough.
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 19.19;
    a *= 0.5;
  }
  return v;
}
`;

const GLSL_WOOD = /* glsl */ `
uniform vec2 uPith;
uniform vec3 uEarlywood;
uniform vec3 uLatewood;
uniform float uBumpScale;
uniform vec3 uSeed;
uniform float uGrainCross;
uniform float uPrimed;
uniform vec3 uPrimer;
varying vec3 vWoodPos;
varying vec3 vWoodNormal;

// Distance from the pith, warped so rings are not perfect circles and drift along the log.
// The slow sine keeps the mapping monotonic while varying ring width between good and lean years.
// Noise is sampled at p + uSeed so each grain preset is a different log; the pith is
// pre-shifted by the same seed on the JS side so the two stay in step.
float woodRadius(vec3 p) {
  vec3 q = p + uSeed;
  float warp = (fbm(q * vec3(0.01, 0.01, 0.0016)) - 0.5) * 4.0;
  float ripple = (fbm(q * vec3(0.06, 0.06, 0.012)) - 0.5) * 1.0;
  float drift = (fbm(vec3(q.z * 0.0035, 3.7, 1.3)) - 0.5) * 9.0;
  // Gentle fibre-scale waver so latewood edges are organic rather than drafted, without tearing.
  float rag = (vnoise(vec3(q.x * 1.3, q.y * 1.3, q.z * 0.05)) - 0.5) * 0.25
    + (vnoise(vec3(q.x * 0.45 + 3.0, q.y * 0.45, q.z * 0.02)) - 0.5) * 0.6;
  // Grain runs about a degree off the length of the piece, as it does in sawn timber.
  float r = length(q.xy - uPith) + warp + ripple + drift + rag + q.z * 0.03;
  return r + 2.5 * sin(r * 0.06) + 0.9 * sin(r * 0.2 + 1.7);
}

// Latewood weight in 0..1. On a face the band glows in and out softly on both sides, the way
// planed pine photographs; on end grain (crisp -> 1) the same ring is a narrow line with a
// sharp outer edge. aa widens the transitions by the pixel footprint so distant rings do not
// shimmer.
float woodLatewood(float r, float aa, float crisp) {
  float ring = floor(r / RING_MM);
  float phase = fract(r / RING_MM);
  float start = mix(0.35 + 0.2 * hash13(vec3(ring, 2.7, 9.1)), 0.66, crisp);
  float depth = 0.65 + 0.35 * hash13(vec3(ring, 8.3, 0.4));
  float rise = mix(0.12, 0.03, crisp);
  float fall = mix(0.12, 0.02, crisp);
  float late = smoothstep(start - rise - aa, 0.82 + aa, phase) * (1.0 - smoothstep(0.86 - fall - aa, 1.0, phase));
  return mix(late * depth, 0.3, smoothstep(0.35, 1.2, aa));
}

// Fine fibres stretched along the length plus resin/pore speckle. px is the surface
// footprint of one pixel in mm; each layer fades out as it approaches pixel size so it
// averages away instead of aliasing.
float woodFibre(vec3 p, float px) {
  vec3 q = p + uSeed;
  float f = fbm(vec3(q.x * 0.7, q.y * 0.7, q.z * 0.03));
  float streaks = vnoise(vec3(q.x * 0.65, q.y * 0.65, q.z * 0.008));
  float hairlines = vnoise(vec3(q.x * 1.9, q.y * 1.9, q.z * 0.006)) + vnoise(vec3(q.x * 3.3 + 7.0, q.y * 3.3, q.z * 0.009)) - 1.0;
  float pores = vnoise(vec3(q.x * 2.4, q.y * 2.4, q.z * 0.09));
  float fibreFade = 1.0 - 0.7 * smoothstep(0.4, 2.5, px);
  float streakFade = 1.0 - smoothstep(0.4, 1.2, px);
  float fineFade = 1.0 - smoothstep(0.15, 0.6, px);
  return (f - 0.5) * 0.7 * fibreFade
    + (streaks - 0.5) * 0.35 * streakFade
    + (hairlines * 0.25 + (pores - 0.5) * 0.3) * fineFade;
}

// Planer / moulder knife marks: shallow ripples running across the grain at a regular pitch
// that wanders slightly, as left by a rotating cutter head. Only visible in the relief.
float planerMarks(vec3 p, float px) {
  float pitch = 2.6;
  float wander = (vnoise(vec3(p.z * 0.02, p.y * 0.05, 2.0)) - 0.5) * 1.5;
  float ripple = 0.5 + 0.5 * cos((p.z + wander) * 6.2831853 / pitch);
  float knifeVar = 0.7 + 0.3 * vnoise(vec3(p.z * 0.09, 5.5, 1.0));
  return ripple * knifeVar * (1.0 - smoothstep(0.5, 1.3, px));
}

float woodHeight(vec3 p, float aa, float px, float crisp, float endGrain) {
  float relief = woodLatewood(woodRadius(p), aa, crisp) + woodFibre(p, px) * 0.45;
  return relief + planerMarks(p, px) * 0.14 * (1.0 - endGrain);
}

vec3 perturbWoodNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
  vec3 sigmaX = normalize(dFdx(surfPos));
  vec3 sigmaY = normalize(dFdy(surfPos));
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const GLSL_WOOD_EVAL = /* glsl */ `
  // Cross grain swaps X and Z so the log axis runs across the profile instead of along it.
  vec3 woodP = mix(vWoodPos, vWoodPos.zyx, uGrainCross);
  vec3 woodN = mix(vWoodNormal, vWoodNormal.zyx, uGrainCross);
  vec3 woodDx = dFdx(woodP);
  vec3 woodDy = dFdy(woodP);
  float woodPx = max(length(woodDx), length(woodDy));
  // End grain: cut across the fibres it is rougher, soaks up light and shows the rings as
  // crisp lines, which is what makes the profile shape read at a glance.
  float endGrain = smoothstep(0.55, 0.9, abs(normalize(woodN).z));
  // Primer follows the sample's sawn ends (world Z), not the rotated fibre axis.
  float cutEnd = smoothstep(0.55, 0.9, abs(normalize(vWoodNormal).z));
  float woodR = woodRadius(woodP);
  float woodAA = fwidth(woodR) / RING_MM;
  float woodLate = woodLatewood(woodR, woodAA, endGrain);
  float woodFib = woodFibre(woodP, woodPx);

  // Large, slow colour drift along the board (heart/sap tint, mineral streaks).
  float tint = fbm(vec3(woodP.x * 0.03, woodP.y * 0.03, woodP.z * 0.0025)) - 0.5;
  // Face bands stay soft and translucent-looking; end grain gets the full ring contrast.
  float bandWeight = mix(0.92, 1.0, endGrain);
  vec3 woodColor = mix(uEarlywood, uLatewood, clamp(woodLate * bandWeight + woodFib * 0.06, 0.0, 1.0));
  woodColor *= 1.0 + tint * vec3(0.08, 0.05, 0.0);
  woodColor *= 1.0 + woodFib * vec3(0.11, 0.13, 0.18);
  woodColor *= mix(1.0, 0.8, endGrain);

  // Softened arrises: the normal swings quickly across a few pixels there. The cutter leaves
  // those edges burnished, so they catch a brighter, tighter highlight than the flat faces.
  float arris = smoothstep(0.04, 0.25, length(fwidth(vWoodNormal)));
  woodColor *= 1.0 + arris * 0.06;

  // Latewood is denser and slightly glossier than the soft, absorbent earlywood; the fibre
  // detail breaks the highlight up so it never reads as a single smooth sheet. The arris
  // roughness is floored so the tight highlight cannot break into sparkling fireflies.
  float woodRough = clamp(0.72 - woodLate * 0.12 + woodFib * 0.22 + endGrain * 0.15, 0.4, 0.95);
  woodRough = mix(woodRough, 0.45, arris * 0.7);

  // No relief on the arrises: the finite-difference bump is unstable where the normal turns
  // fast and only adds noise to an edge that should read as a clean highlight.
  float woodH0 = woodHeight(woodP, woodAA, woodPx, endGrain, endGrain);
  vec2 woodDHdxy = vec2(
    woodHeight(woodP + woodDx, woodAA, woodPx, endGrain, endGrain) - woodH0,
    woodHeight(woodP + woodDy, woodAA, woodPx, endGrain, endGrain) - woodH0
  ) * uBumpScale * (1.0 - arris);

  // Primed finish: the machined faces carry a coat of matte primer while the cut ends stay
  // bare timber. Primer fills most of the grain, so only a faint ghost of the relief remains.
  float primed = uPrimed * (1.0 - cutEnd);
  vec3 primerColor = uPrimer * (1.0 + woodFib * 0.03 + woodLate * 0.015);
  woodColor = mix(woodColor, primerColor, primed);
  woodRough = mix(woodRough, 0.82 - arris * 0.15, primed);
  woodDHdxy *= mix(1.0, 0.3, primed);
`;

const VERTEX_PARS = /* glsl */ `
varying vec3 vWoodPos;
varying vec3 vWoodNormal;
`;

export function createTimberMaterial(
  loops: ProfileLoops,
  length: number,
  style: GrainStyle = 'flat',
  primed = false,
  direction: GrainDirection = 'long'
): THREE.MeshPhysicalMaterial {
  const bounds = profileBounds(loops);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const grain = GRAIN_STYLES[style];
  const woodWidth = direction === 'cross' ? length : width;

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0,
    specularIntensity: 0.35,
    // Highlights stretch along the fibres. The mesh UVs put u along the length so the
    // anisotropy tangent follows the grain on every face. Paint has no fibre direction.
    anisotropy: primed ? 0 : 0.55,
    anisotropyRotation: 0,
  });

  // Boards are flat-sawn with the wide face tangential to the rings, so the pith sits out
  // beyond the wider face: above a flat moulding, or beyond the camera-side (+x) face of a
  // standing one. Only a handful of rings then cross that face, near-tangent, giving the
  // broad flame figure of clear pine, while the end grain shows the same rings as arcs.
  const pithDistance = Math.max(60, grain.pithFactor * Math.max(woodWidth, height));
  const pith =
    woodWidth >= height
      ? new THREE.Vector2(woodWidth * 0.2, height + pithDistance * grain.pithLift)
      : new THREE.Vector2(woodWidth / 2 + pithDistance * grain.pithLift, height * 0.7);
  // The shader samples everything at position + seed, so shift the pith by the same amount.
  pith.x += grain.seed.x;
  pith.y += grain.seed.y;
  const uniforms = {
    uPith: { value: pith },
    uSeed: { value: grain.seed },
    // Photographed clear pine: warm honey earlywood, soft tan latewood. THREE.Color already
    // converts hex (sRGB) into the linear working space, so no further conversion here.
    uEarlywood: { value: new THREE.Color('#e2cfa3') },
    uLatewood: { value: new THREE.Color('#bf955a') },
    uBumpScale: { value: 0.35 },
    uGrainCross: { value: direction === 'cross' ? 1 : 0 },
    uPrimed: { value: primed ? 1 : 0 },
    // Factory primer: a soft warm white rather than a paper white.
    uPrimer: { value: new THREE.Color('#e3e0d8') },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vWoodNormal = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWoodPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define RING_MM ${RING_MM.toFixed(2)}\n${GLSL_NOISE}\n${GLSL_WOOD}`)
      .replace('#include <map_fragment>', `${GLSL_WOOD_EVAL}\n  diffuseColor.rgb *= woodColor;`)
      .replace('#include <roughnessmap_fragment>', '  float roughnessFactor = woodRough;')
      .replace(
        '#include <normal_fragment_maps>',
        '  normal = perturbWoodNormal(-vViewPosition, normal, woodDHdxy, faceDirection);'
      );
  };
  material.customProgramCacheKey = () => 'timber-pine-solid-v5';
  return material;
}
