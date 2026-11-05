import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SPECIES, SPECIES, SPECIES_IDS, isSpeciesId } from './species';
import { createTimberMaterial } from './timberMaterial';
import { FINISHES } from './finishes';
import type { ProfileLoops } from './profileSolid';

const LOOPS: ProfileLoops = {
  outer: [
    { x: 0, y: 0 },
    { x: 65, y: 0 },
    { x: 65, y: 15 },
    { x: 0, y: 15 },
  ],
  holes: [],
};

/** Run the material's shader patch against a stub program and return the uniforms it bound. */
function compiledUniforms(material: THREE.MeshPhysicalMaterial) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader:
      '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_physical_fragment>\nvec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe('species', () => {
  it('keeps every species inside the range the shader draws over', () => {
    for (const id of SPECIES_IDS) {
      const species = SPECIES[id];
      expect(species.earlywood).toMatch(/^#[0-9a-f]{6}$/);
      expect(species.latewood).toMatch(/^#[0-9a-f]{6}$/);
      expect(species.ringMm).toBeGreaterThan(0);
      for (const value of [species.latewoodStart, species.ringContrast, species.resin, species.roughness]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      // The shader adds up to 0.12 per ring and ends the line at 0.82, so any later start
      // leaves some rings with no latewood line at all.
      expect(species.latewoodStart).toBeLessThanOrEqual(0.7);
      expect(species.heartBand[0]).toBeLessThan(species.heartBand[1]);
    }
  });

  it('gives only the resinous softwood resin', () => {
    expect(SPECIES.pine.resin).toBe(1);
    expect(SPECIES.cedar.resin).toBe(0);
    expect(SPECIES.beech.resin).toBe(0);
    expect(SPECIES.oak.resin).toBe(0);
  });

  it('recognises only the ids it defines', () => {
    expect(SPECIES_IDS.every(isSpeciesId)).toBe(true);
    expect(isSpeciesId(DEFAULT_SPECIES)).toBe(true);
    expect(isSpeciesId('rimu')).toBe(false);
  });
});

describe('createTimberMaterial', () => {
  it('draws the log with the chosen species', () => {
    for (const id of SPECIES_IDS) {
      const species = SPECIES[id];
      const material = createTimberMaterial(LOOPS, { species, grain: 'flat', direction: 'long', finish: FINISHES.clear });
      const { uniforms, fragmentShader } = compiledUniforms(material);
      expect(uniforms.uEarlywood.value).toEqual(new THREE.Color(species.earlywood));
      expect(uniforms.uLatewood.value).toEqual(new THREE.Color(species.latewood));
      expect(uniforms.uRingMm.value).toBe(species.ringMm);
      expect(uniforms.uResin.value).toBe(species.resin);
      expect(uniforms.uBumpScale.value).toBe(species.bump);
      // The ring pitch is a uniform, so no species leaves a stale constant in the program.
      expect(fragmentShader).not.toContain('RING_MM');
    }
  });

  it('shares one compiled program across species', () => {
    const keys = new Set(
      SPECIES_IDS.map((id) =>
        createTimberMaterial(LOOPS, { species: SPECIES[id], grain: 'flat', direction: 'long', finish: FINISHES.clear }).customProgramCacheKey()
      )
    );
    expect(keys.size).toBe(1);
  });
});
