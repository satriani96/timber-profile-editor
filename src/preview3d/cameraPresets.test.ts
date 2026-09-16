import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_PRESETS,
  cameraDirection,
  studioRigQuaternion,
  rotateStudioPoint,
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
