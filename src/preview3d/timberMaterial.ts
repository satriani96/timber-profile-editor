import * as THREE from 'three';
import { profileBounds, type ProfileLoops } from './profileSolid';

/**
 * Solid (3D) procedural clear-pine material.
 *
 * Instead of wrapping a flat picture around the extrusion, the shader models the log the
 * sample was cut from: concentric growth rings around a pith that sits above the piece,
 * distorted by low-frequency noise, with fine fibres running along the length. Because
 * the grain is evaluated in 3D at every surface point, end grain shows the ring arcs,
 * faces show cathedral figure where the profile cuts the rings, and the two always match.
 */

const RING_MM = 9.0;

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
varying vec3 vWoodPos;
varying vec3 vWoodNormal;

// Distance from the pith, warped so rings are not perfect circles and drift along the log.
// The slow sine keeps the mapping monotonic while varying ring width between good and lean years.
float woodRadius(vec3 p) {
  float warp = (fbm(p * vec3(0.01, 0.01, 0.0016)) - 0.5) * 4.0;
  float ripple = (fbm(p * vec3(0.06, 0.06, 0.012)) - 0.5) * 1.4;
  float drift = (fbm(vec3(p.z * 0.0035, 3.7, 1.3)) - 0.5) * 9.0;
  // Grain runs about a degree off the length of the piece, as it does in sawn timber.
  float r = length(p.xy - uPith) + warp + ripple + drift + p.z * 0.03;
  return r + 3.0 * sin(r * 0.05) + 1.2 * sin(r * 0.17 + 1.7);
}

// Latewood weight in 0..1. Earlywood is wide and pale; latewood darkens gradually and then
// stops at the ring boundary, giving the soft flame figure of planed pine. On end grain
// (crisp -> 1) the rings read as narrow, sharply drawn lines instead. aa widens the
// transitions by the pixel footprint so distant rings do not shimmer.
float woodLatewood(float r, float aa, float crisp) {
  float ring = floor(r / RING_MM);
  float phase = fract(r / RING_MM);
  float start = mix(0.3 + 0.2 * hash13(vec3(ring, 2.7, 9.1)), 0.66, crisp);
  float depth = 0.7 + 0.3 * hash13(vec3(ring, 8.3, 0.4));
  float rise = mix(0.08, 0.03, crisp);
  // Earlywood blends slowly into latewood; the ring boundary on the far side is crisper.
  float late = smoothstep(start - rise - aa, 0.85 + aa, phase) * (1.0 - smoothstep(0.9 - aa, 1.0, phase));
  return mix(late * depth, 0.3, smoothstep(0.35, 1.2, aa));
}

// Fine fibres stretched along the length plus resin/pore speckle. px is the surface
// footprint of one pixel in mm; detail finer than that is faded out rather than aliased.
float woodFibre(vec3 p, float px) {
  float f = fbm(vec3(p.x * 0.7, p.y * 0.7, p.z * 0.03));
  float streaks = vnoise(vec3(p.x * 0.65, p.y * 0.65, p.z * 0.008));
  float pores = vnoise(vec3(p.x * 2.4, p.y * 2.4, p.z * 0.09));
  float fibreFade = 1.0 - 0.7 * smoothstep(0.4, 2.5, px);
  float fineFade = 1.0 - smoothstep(0.12, 0.5, px);
  return (f - 0.5) * fibreFade + ((streaks - 0.5) * 0.7 + (pores - 0.5) * 0.3) * fineFade;
}

float woodHeight(vec3 p, float aa, float px, float crisp) {
  return woodLatewood(woodRadius(p), aa, crisp) + woodFibre(p, px) * 0.45;
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
  vec3 woodDx = dFdx(vWoodPos);
  vec3 woodDy = dFdy(vWoodPos);
  float woodPx = max(length(woodDx), length(woodDy));
  // End grain: cut across the fibres it is rougher, soaks up light and shows the rings as
  // crisp lines, which is what makes the profile shape read at a glance.
  float endGrain = smoothstep(0.55, 0.9, abs(normalize(vWoodNormal).z));
  float woodR = woodRadius(vWoodPos);
  float woodAA = fwidth(woodR) / RING_MM;
  float woodLate = woodLatewood(woodR, woodAA, endGrain);
  float woodFib = woodFibre(vWoodPos, woodPx);

  // Large, slow colour drift along the board (heart/sap tint, mineral streaks).
  float tint = fbm(vec3(vWoodPos.x * 0.03, vWoodPos.y * 0.03, vWoodPos.z * 0.0025)) - 0.5;
  vec3 woodColor = mix(uEarlywood, uLatewood, clamp(woodLate * 0.9 + woodFib * 0.06, 0.0, 1.0));
  woodColor *= 1.0 + tint * vec3(0.08, 0.05, 0.0);
  woodColor *= 1.0 + woodFib * vec3(0.09, 0.11, 0.15);
  woodColor *= mix(1.0, 0.8, endGrain);

  // Latewood is denser and slightly glossier than the soft, absorbent earlywood.
  float woodRough = clamp(0.78 - woodLate * 0.12 + woodFib * 0.1 + endGrain * 0.15, 0.45, 0.95);

  float woodH0 = woodHeight(vWoodPos, woodAA, woodPx, endGrain);
  vec2 woodDHdxy = vec2(
    woodHeight(vWoodPos + woodDx, woodAA, woodPx, endGrain) - woodH0,
    woodHeight(vWoodPos + woodDy, woodAA, woodPx, endGrain) - woodH0
  ) * uBumpScale;
`;

const VERTEX_PARS = /* glsl */ `
varying vec3 vWoodPos;
varying vec3 vWoodNormal;
`;

export function createTimberMaterial(loops: ProfileLoops): THREE.MeshPhysicalMaterial {
  const bounds = profileBounds(loops);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0,
    specularIntensity: 0.3,
  });

  // Boards are flat-sawn with the wide face tangential to the rings, so the pith sits out
  // beyond the wider face: above a flat moulding, or beyond the camera-side (+x) face of a
  // standing one. Only a handful of rings then cross that face, near-tangent, giving the
  // broad flame figure of clear pine, while the end grain shows the same rings as arcs.
  const pithDistance = Math.max(60, 1.1 * Math.max(width, height));
  const pith =
    width >= height
      ? new THREE.Vector2(width * 0.2, height + pithDistance * 0.8)
      : new THREE.Vector2(width / 2 + pithDistance * 0.8, height * 0.7);
  const uniforms = {
    uPith: { value: pith },
    // Photographed clear pine: warm honey earlywood, soft tan latewood. THREE.Color already
    // converts hex (sRGB) into the linear working space, so no further conversion here.
    uEarlywood: { value: new THREE.Color('#e2cfa3') },
    uLatewood: { value: new THREE.Color('#b6935f') },
    uBumpScale: { value: 0.2 },
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
  material.customProgramCacheKey = () => 'timber-pine-solid-v1';
  return material;
}
