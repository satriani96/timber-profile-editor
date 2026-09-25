import * as THREE from 'three';
import { profileBounds, type ProfileLoops } from './profileSolid';
import { DEFAULT_FINISH, FINISHES, type Finish } from './finishes';

/**
 * Solid (3D) procedural clear-pine material.
 *
 * Instead of wrapping a flat picture around the extrusion, the shader models the log the
 * sample was cut from: concentric growth rings around a pith that sits above the piece,
 * distorted by low-frequency noise, with fine fibres running along the log. Because
 * the grain is evaluated in 3D at every surface point, end grain shows the ring arcs,
 * faces show cathedral figure where the profile cuts the rings, and the two always match.
 * The log axis always follows the extrusion, so the docked ends stay end grain and the
 * moulded faces stay face grain. Long puts the pith beyond the wide face, so the rings
 * cross the long side of that end. Cross quarters the same log the other way — pith
 * beyond the narrow face, like slicing a pizza — so those rings run the short side.
 */

/** Ring pitch. Tighter rings put more fine grain lines across a planed face. */
const RING_MM = 5.0;

/**
 * How the sample was cut from the log. Only the pith position and the noise seed change, so
 * the three looks share one shader.
 */
export type GrainStyle = 'crown' | 'flat' | 'quarter';

/** Which way the growth rings cross the docked end. The log axis does not move. */
export type GrainDirection = 'long' | 'cross';

/**
 * Pith in the profile plane. Long sits it beyond the wide face, so end-grain rings run
 * the long side of the cut. Cross sits it beyond the narrow face — the board taken out
 * of the log like a pizza slice — so the same rings run the short side.
 */
export function pithForCut(
  width: number,
  height: number,
  pithDistance: number,
  pithLift: number,
  direction: GrainDirection
): { x: number; y: number } {
  const beyondWide =
    width >= height
      ? { x: width * 0.2, y: height + pithDistance * pithLift }
      : { x: width / 2 + pithDistance * pithLift, y: height * 0.7 };
  const beyondNarrow =
    width >= height
      ? { x: width / 2 + pithDistance * pithLift, y: height * 0.5 }
      : { x: width * 0.2, y: height + pithDistance * pithLift };
  return direction === 'cross' ? beyondNarrow : beyondWide;
}

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
uniform float uCoatCover;
uniform float uCoatGrain;
uniform float uCoatRough;
uniform float uCoatRelief;
uniform vec3 uCoatColor;
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
  // Good and lean years, and a slower swing along the log so one stretch of the board
  // grew tighter than the next. A sine of radius alone repeats the same stripe forever.
  float along = 0.5 + 0.5 * sin(q.z * 0.02 + 1.1);
  return r + (4.0 * sin(r * 0.045) + 1.2 * sin(r * 0.2 + 1.7)) * mix(0.6, 1.35, along);
}

// Latewood weight in 0..1. On a face the band is a fairly narrow line that eases in and out,
// the way planed pine photographs; on end grain (crisp -> 1) the same ring is a crisp line
// with a sharp outer edge. aa widens the transitions by the pixel footprint so distant rings
// do not shimmer.
float woodLatewood(float r, float aa, float crisp) {
  float ring = floor(r / RING_MM);
  float phase = fract(r / RING_MM);
  // A face is mostly earlywood. Latewood is a line near the end of the ring, not a band
  // that fills half of it. On the cut end the same ring opens up and every line shows.
  float start = mix(0.66 + 0.12 * hash13(vec3(ring, 2.7, 9.1)), 0.5, crisp);
  // On a face some rings barely register and others are strong: that variation in line
  // weight is what separates real grain from a printed pattern. On a cut end every ring shows.
  float depthVar = hash13(vec3(ring, 8.3, 0.4));
  float depth = mix(0.4 + 0.6 * depthVar, 0.8 + 0.2 * depthVar, crisp);
  float rise = mix(0.07, 0.03, crisp);
  float fall = mix(0.06, 0.02, crisp);
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
  // Individual fibres: hair-thin, running a long way down the board.
  float hairs = vnoise(vec3(q.x * 4.0 + 11.0, q.y * 4.0, q.z * 0.004)) - 0.5;
  float pores = vnoise(vec3(q.x * 2.4, q.y * 2.4, q.z * 0.09));
  float fibreFade = 1.0 - 0.7 * smoothstep(0.4, 2.5, px);
  float streakFade = 1.0 - smoothstep(0.4, 1.2, px);
  float fineFade = 1.0 - smoothstep(0.15, 0.6, px);
  float hairFade = 1.0 - smoothstep(0.12, 0.5, px);
  return (f - 0.5) * 0.6 * fibreFade
    + (streaks - 0.5) * 0.4 * streakFade
    + (hairlines * 0.45 + (pores - 0.5) * 0.3) * fineFade
    + hairs * 0.6 * hairFade;
}

// End grain is cut across the fibres, so it is a field of open cells far finer than a pixel:
// a faint, fine mottle with the odd resin canal as a tiny dark point. Anything coarser reads
// as sandpaper. Fades out as the cells approach pixel size.
float endGrainPores(vec3 p, float px) {
  vec3 q = p + uSeed;
  float mottle = vnoise(q * 3.0) + 0.5 * vnoise(q * 7.0 + 3.0) - 0.75;
  float canals = smoothstep(0.84, 0.9, vnoise(q * 6.0 + 7.0));
  return (mottle * 0.35 - canals * 0.5) * (1.0 - smoothstep(0.1, 0.4, px));
}

// Rays: ribbons of cells running out from the pith. On a cut end they are hair-fine radial
// lines crossing the rings, the detail that makes end grain read as wood under a close look.
float endGrainRays(vec3 p, float px) {
  vec2 d = p.xy + uSeed.xy - uPith;
  float r = length(d);
  // Arc length around the pith, so the rays keep a constant spacing in millimetres. The angle
  // is measured from the pith-to-piece direction so its wrap-around never lands on the cut.
  vec2 toPiece = normalize(uSeed.xy - uPith);
  float across = atan(toPiece.x * d.y - toPiece.y * d.x, dot(toPiece, d)) * r;
  float ray = vnoise(vec3(across * 3.2, r * 0.12, p.z * 0.01 + 5.0));
  return smoothstep(0.62, 0.8, ray) * (1.0 - smoothstep(0.06, 0.25, px));
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

// Docking saw marks: a crosscut blade leaves faint scored arcs across the cut end at roughly
// its tooth pitch. The blade centre sits well off the piece so the arcs are gentle curves,
// and shifts with z so the two ends of the sample were not cut by the same pass.
float sawMarks(vec3 p, float px) {
  float d = length(p.xy - vec2(-180.0 + p.z * 0.3, 260.0));
  float wander = (vnoise(vec3(p.xy * 0.08, 4.0 + p.z * 0.01)) - 0.5) * 0.6;
  float score = 0.5 + 0.5 * cos((d + wander) * 6.2831853 / 0.9);
  float tooth = 0.6 + 0.4 * vnoise(vec3(d * 0.4, 1.7, 3.0 + p.z * 0.01));
  return score * tooth * (1.0 - smoothstep(0.08, 0.35, px));
}

// Planed pine is close to flat: the latewood stands a hair proud after the cutter and the
// fibres barely register. Fibre and knife marks are kept faint so they never cross into a
// woven texture; the fibre shows in colour and in the stretched highlight instead. Cut ends
// keep their open-cell relief and the saw's scoring.
float woodHeight(vec3 p, float aa, float px, float crisp, float endGrain) {
  float relief = woodLatewood(woodRadius(p), aa, crisp) + woodFibre(p, px) * 0.15;
  return relief + planerMarks(p, px) * 0.03 * (1.0 - endGrain)
    + (endGrainPores(p, px) * 0.4 + sawMarks(p, px) * 0.12) * endGrain;
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
  // One log, axis along the extrusion. Long and Cross only move the pith in the profile
  // plane, so the same faces stay face grain and the docked ends stay the cut.
  vec3 woodP = vWoodPos;
  vec3 woodDx = dFdx(woodP);
  vec3 woodDy = dFdy(woodP);
  float woodPx = max(length(woodDx), length(woodDy));
  // End grain: cut across the fibres it is rougher, soaks up light and shows the rings as
  // crisp lines, which is what makes the profile shape read at a glance.
  float endGrain = smoothstep(0.55, 0.9, abs(normalize(vWoodNormal).z));
  // A coat lies on the machined faces only: the docked ends of a sample are bare timber.
  float cutEnd = endGrain;
  float woodR = woodRadius(woodP);
  float woodAA = fwidth(woodR) / RING_MM;
  float woodLate = woodLatewood(woodR, woodAA, endGrain);
  float woodFib = woodFibre(woodP, woodPx);

  // Heartwood is a region of the log, tens of centimetres long, not a wash over every pixel.
  float heart = smoothstep(0.46, 0.62, fbm(vec3(woodP.z * 0.004, woodP.x * 0.008, 2.4)));
  // Face bands stay a line; end grain gets the full ring contrast.
  float bandWeight = mix(0.85, 1.0, endGrain);
  // The fibre noise is stretched along the log, so on a face it draws streaks; on the cut end
  // it has no stretch left and would blot the earlywood, so it is mostly held back there.
  float woodFibColor = woodFib * mix(1.0, 0.3, endGrain);
  vec3 woodColor = mix(uEarlywood, uLatewood, clamp(woodLate * bandWeight + woodFibColor * 0.08, 0.0, 1.0));
  woodColor *= mix(vec3(1.0), vec3(1.04, 0.98, 0.92), heart);
  woodColor *= 1.0 + woodFibColor * vec3(0.16, 0.19, 0.24);
  // A resin streak: rare, long, amber. A canal in the wood, not a crack or a stain.
  float resin = smoothstep(0.8, 0.9, vnoise(vec3(woodP.x * 0.05, woodP.y * 0.05, woodP.z * 0.003)));
  resin *= smoothstep(0.62, 0.78, vnoise(vec3(woodP.x * 0.35, woodP.y * 0.35, woodP.z * 0.008)));
  woodColor = mix(woodColor, woodColor * vec3(1.2, 0.9, 0.5), resin * 0.35);
  // Open cells on the end grain: darker, redder rings and a faintly mottled earlywood. Light
  // goes down the cut cells and is absorbed, so the whole end reads darker and more saturated
  // (warmer) than the planed faces, not greyer.
  float endPore = endGrainPores(woodP, woodPx);
  woodColor *= 1.0 + endGrain * (endPore * 0.25 - woodLate * vec3(0.16, 0.24, 0.3));
  // Rays catch a touch more light than the cells around them.
  woodColor *= 1.0 + endGrain * endGrainRays(woodP, woodPx) * 0.06;
  woodColor *= mix(vec3(1.0), vec3(0.74, 0.66, 0.57), endGrain);
  // The blade's scoring burnishes a faint line of crushed fibre into each arc.
  woodColor *= 1.0 - endGrain * sawMarks(woodP, woodPx) * 0.05;

  // Rounded arrises: the normal swings quickly across a few pixels there. The geometry carries
  // the round, so the highlight is left entirely to the lighting. Making these edges glossier
  // than the face, as a burnished cutter mark would, only sharpens them into a plastic line.
  float arris = smoothstep(0.04, 0.25, length(fwidth(vWoodNormal)));

  // Planed clear pine has a soft satin sheen (roughness around 0.6); the dense latewood is a
  // little glossier than the absorbent earlywood and the fibre breaks the highlight into
  // streaks. A cut end is a field of open, torn cells with no surface to reflect from: fully
  // rough, with only the latewood, which the blade cuts cleanly, keeping a trace of sheen.
  float faceRough = clamp(0.62 - woodLate * 0.08 + woodFib * 0.14, 0.42, 0.9);
  float endRough = 1.0 - woodLate * 0.12;
  float woodRough = mix(faceRough, endRough, endGrain);

  // No relief on the arrises: the finite-difference bump is unstable where the normal turns
  // fast and only adds noise to an edge that should read as a clean highlight.
  float woodH0 = woodHeight(woodP, woodAA, woodPx, endGrain, endGrain);
  vec2 woodDHdxy = vec2(
    woodHeight(woodP + woodDx, woodAA, woodPx, endGrain, endGrain) - woodH0,
    woodHeight(woodP + woodDy, woodAA, woodPx, endGrain, endGrain) - woodH0
  ) * uBumpScale * (1.0 - arris);

  // Applied finish. Pigment does not sit evenly on pine: the open earlywood drinks it and the
  // dense latewood sheds it. So the coverage varies across each ring and the pigment itself is
  // modulated by the fibre, which is what keeps the grain readable under a dark oil instead of
  // the face going flat black, and leaves a faint ghost of the figure under primer.
  float coat = uCoatCover * (1.0 - cutEnd);
  float uptake = 1.0 - uCoatGrain * clamp(woodLate * 0.9 + woodFib * 0.5, -0.4, 1.0);
  vec3 pigment = uCoatColor * (1.0 + uCoatGrain * (woodFib * 0.5 + woodLate * 0.3));
  // Pigment lying in the open cells takes most of the timber's warmth with it, so what reads
  // through a thin spot is the figure rather than the honey colour of raw pine. Without this a
  // dark oil goes bronze: the few percent of pine showing is far brighter than the pigment.
  vec3 underCoat = mix(woodColor, vec3(dot(woodColor, vec3(0.2126, 0.7152, 0.0722))), coat * 0.75);
  woodColor = mix(underCoat, pigment, clamp(coat * uptake, 0.0, 1.0));
  // A coated face is not uniformly glossy: the coat thins over the dense latewood and pools in
  // the open cells, so the sheen varies along the fibre. Without that the highlight is one
  // unbroken band and even a correctly coloured face reads as plastic.
  woodRough = mix(woodRough, uCoatRough + woodFib * 0.1 - woodLate * 0.04, coat);
  woodDHdxy *= mix(1.0, uCoatRelief, coat);
`;

// Applied after the light is summed. Only the grazing edge and the cut end pick up a warmer
// leak, and the tint is darker than the face so it cannot push a planed surface into white.
// A coat of primer is a film and blocks it; oil does not.
const GLSL_SCATTER = /* glsl */ `
  float woodFacing = saturate(dot(normalize(normal), geometryViewDir));
  float woodEdge = pow(1.0 - woodFacing, 2.0);
  float woodScatter = (woodEdge * 0.18 + endGrain * 0.16) * (1.0 - woodLate * 0.4);
  woodScatter *= mix(1.0, 0.15, coat);
  outgoingLight += totalDiffuse * vec3(0.72, 0.4, 0.2) * woodScatter;
`;

// Applied once three has built the BRDF inputs. The finish's specular and fibre-aligned
// highlight describe the machined faces; a cut end reflects a fraction of that and has no
// fibre direction in its plane, so a stretched highlight across it reads as moulded plastic.
const GLSL_END_GRAIN_BRDF = /* glsl */ `
  float woodSpecKeep = mix(1.0, 0.3 + woodLate * 0.15, endGrain);
  material.specularF90 *= woodSpecKeep;
  material.specularColor *= woodSpecKeep;
  material.specularColorBlended *= woodSpecKeep;
  #ifdef USE_ANISOTROPY
    material.anisotropy *= 1.0 - endGrain;
    material.alphaT = mix(pow2(material.roughness), 1.0, pow2(material.anisotropy));
  #endif
`;

const VERTEX_PARS = /* glsl */ `
varying vec3 vWoodPos;
varying vec3 vWoodNormal;
`;

function hashSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * three caches compiled programs by this key, so it must change whenever the injected GLSL
 * does. Deriving it from the source means an edit can never silently reuse a stale program.
 */
const SHADER_CACHE_KEY = `timber-pine-solid-${hashSource(GLSL_NOISE + GLSL_WOOD + GLSL_WOOD_EVAL + GLSL_SCATTER + GLSL_END_GRAIN_BRDF + VERTEX_PARS + RING_MM)}`;

export function createTimberMaterial(
  loops: ProfileLoops,
  _length: number,
  style: GrainStyle = 'flat',
  finish: Finish = FINISHES[DEFAULT_FINISH],
  direction: GrainDirection = 'long'
): THREE.MeshPhysicalMaterial {
  const bounds = profileBounds(loops);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const grain = GRAIN_STYLES[style];

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0,
    // Wood is a plain dielectric (IOR ~1.45, specular ~0.5); bare timber sits under that
    // because the open surface scatters some of what a polished dielectric would reflect,
    // while an oiled face fills those cells and comes back up towards it.
    specularIntensity: finish.specular,
    // Highlights stretch along the fibres. The mesh UVs put u along the length so the
    // anisotropy tangent follows the grain on every face.
    anisotropy: finish.anisotropy,
    anisotropyRotation: 0,
  });

  // How far the pith sits sets the figure (crown / flat / quarter). Which side it sits on
  // is the Long/Cross cut: beyond the wide face the end-grain rings run the long way;
  // beyond the narrow face they run the short way.
  const pithDistance = Math.max(60, grain.pithFactor * Math.max(width, height));
  const placed = pithForCut(width, height, pithDistance, grain.pithLift, direction);
  const pith = new THREE.Vector2(placed.x, placed.y);
  // The shader samples everything at position + seed, so shift the pith by the same amount.
  pith.x += grain.seed.x;
  pith.y += grain.seed.y;
  const uniforms = {
    uPith: { value: pith },
    uSeed: { value: grain.seed },
    // Photographed clear pine: pale cream earlywood, soft pinkish-tan latewood. The warm key
    // light and tone mapping add the honey on top, so these read paler than the final image.
    // THREE.Color already converts hex (sRGB) into the linear working space.
    uEarlywood: { value: new THREE.Color('#eadcbf') },
    uLatewood: { value: new THREE.Color('#bd9062') },
    uBumpScale: { value: 0.22 },
    uCoatCover: { value: finish.cover },
    uCoatGrain: { value: finish.grain },
    uCoatRough: { value: finish.roughness },
    uCoatRelief: { value: finish.relief },
    uCoatColor: { value: new THREE.Color(finish.color) },
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
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${GLSL_END_GRAIN_BRDF}`)
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\n${GLSL_SCATTER}`
      )
      .replace(
        '#include <normal_fragment_maps>',
        '  normal = perturbWoodNormal(-vViewPosition, normal, woodDHdxy, faceDirection);'
      );
  };
  material.customProgramCacheKey = () => SHADER_CACHE_KEY;
  return material;
}
