import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_PRESETS,
  cameraDirection,
  studioRigQuaternion,
  keyLightPosition,
  rotateStudioPoint,
  stageSample,
} from './cameraPresets';

describe('studioRigQuaternion', () => {
  it('is identity at the default three-quarter view', () => {
    const { azimuth, elevation } = CAMERA_PRESETS.threeQuarter;
    const q = studioRigQuaternion(azimuth, elevation);
    expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(1e-8);
  });

  it('maps the default camera direction onto another preset', () => {
    const from = cameraDirection(CAMERA_PRESETS.threeQuarter.azimuth, CAMERA_PRESETS.threeQuarter.elevation);
    const { azimuth, elevation } = CAMERA_PRESETS.face;
    const to = cameraDirection(azimuth, elevation);
    const mapped = from.clone().applyQuaternion(studioRigQuaternion(azimuth, elevation));
    expect(mapped.angleTo(to)).toBeLessThan(1e-8);
  });
});

describe('stageSample', () => {
  // A 65 x 15 board, 300 long, as the mesh builds it: profile in XY on the ground, length along Z.
  const corners = [-32.5, 32.5].flatMap((x) =>
    [0, 15].flatMap((y) => [-150, 150].map((z) => new THREE.Vector3(x, y, z)))
  );
  const staged = (id: 'face' | 'upright') => {
    const staging = stageSample(CAMERA_PRESETS[id], 65, 15, 300);
    const matrix = new THREE.Matrix4()
      .makeTranslation(...staging.position)
      .multiply(new THREE.Matrix4().makeRotationX(staging.rotationX));
    return { staging, box: new THREE.Box3().setFromPoints(corners.map((c) => c.clone().applyMatrix4(matrix))) };
  };

  it('stands the upright sample on its end, centred on the target', () => {
    const { staging, box } = staged('upright');
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(300);
    expect(box.min.z).toBeCloseTo(-7.5);
    expect(box.max.z).toBeCloseTo(7.5);
    expect(staging.target).toEqual([0, 150, 0]);
    expect(staging.footprint).toEqual([32.5, 7.5]);
  });

  it('turns the top face of the drawing towards the upright camera', () => {
    const { staging } = staged('upright');
    const normal = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(staging.rotationX));
    const toCamera = cameraDirection(CAMERA_PRESETS.upright.azimuth, CAMERA_PRESETS.upright.elevation);
    expect(normal.angleTo(toCamera)).toBeLessThan(1e-8);
  });

  it('leaves the lying presets where the mesh was built', () => {
    const { box } = staged('face');
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.z).toBeCloseTo(150);
  });
});

describe('keyLightPosition', () => {
  const target = new THREE.Vector3(0, 150, 0);

  it('rakes the upright key across the face from the camera side', () => {
    const toKey = new THREE.Vector3(...keyLightPosition(CAMERA_PRESETS.upright, target, 300)).sub(target).normalize();
    // The upright face looks straight at the camera (+Z). The key sits to the camera's right
    // (+X) and meets the face low, between 15 and 30 degrees off its surface.
    expect(toKey.x).toBeGreaterThan(0);
    const offSurface = Math.PI / 2 - toKey.angleTo(new THREE.Vector3(0, 0, 1));
    expect(offSurface).toBeGreaterThan((15 * Math.PI) / 180);
    expect(offSurface).toBeLessThan((30 * Math.PI) / 180);
  });

  it('keeps the catalogue key where the default shot authored it', () => {
    const { threeQuarter } = CAMERA_PRESETS;
    const [x, y, z] = keyLightPosition(threeQuarter, target, 300);
    expect(x).toBeCloseTo(330);
    expect(y).toBeCloseTo(420);
    expect(z).toBeCloseTo(270);
  });
});

describe('rotateStudioPoint', () => {
  it('leaves a point on the pivot unchanged', () => {
    const pivot = new THREE.Vector3(0, 10, 0);
    const q = studioRigQuaternion(CAMERA_PRESETS.face.azimuth, CAMERA_PRESETS.face.elevation);
    const [x, y, z] = rotateStudioPoint(pivot.x, pivot.y, pivot.z, pivot, q);
    expect(x).toBeCloseTo(pivot.x);
    expect(y).toBeCloseTo(pivot.y);
    expect(z).toBeCloseTo(pivot.z);
  });
});
