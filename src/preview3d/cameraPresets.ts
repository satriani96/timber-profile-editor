import * as THREE from 'three';

export const CAMERA_PRESET_IDS = ['threeQuarter', 'threeQuarterOpposite', 'end', 'face'] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export interface CameraPreset {
  label: string;
  title: string;
  azimuth: number;
  elevation: number;
}

const deg = (degrees: number) => (degrees * Math.PI) / 180;

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  threeQuarter: {
    label: '¾ view',
    title: 'End grain on the left, moulded face towards the camera',
    azimuth: deg(45),
    elevation: deg(14),
  },
  threeQuarterOpposite: {
    label: '¾ other side',
    title: 'Opposite three-quarter: the other long face towards the camera',
    azimuth: deg(-45),
    elevation: deg(14),
  },
  end: {
    label: 'End',
    title: 'Looking along the length at the end grain',
    azimuth: deg(12),
    elevation: deg(10),
  },
  face: {
    label: 'Face',
    title: 'Moulded face towards the camera, length across the frame',
    azimuth: deg(90),
    elevation: deg(12),
  },
};

export const DEFAULT_CAMERA_PRESET: CameraPresetId = 'threeQuarter';

/** Authored studio HDR yaw for the default three-quarter shot. */
export const STUDIO_ENV_YAW = Math.PI * 0.35;

export function isCameraPresetId(value: string): value is CameraPresetId {
  return CAMERA_PRESET_IDS.some((id) => id === value);
}

export function cameraDirection(azimuth: number, elevation: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth)
  );
}

const DEFAULT_DIRECTION = cameraDirection(
  CAMERA_PRESETS.threeQuarter.azimuth,
  CAMERA_PRESETS.threeQuarter.elevation
);

/** Quaternion that takes the default catalogue camera direction onto `azimuth`/`elevation`. */
export function studioRigQuaternion(azimuth: number, elevation: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(DEFAULT_DIRECTION, cameraDirection(azimuth, elevation));
}

export function rotateStudioPoint(
  x: number,
  y: number,
  z: number,
  pivot: THREE.Vector3,
  quaternion: THREE.Quaternion
): [number, number, number] {
  const point = new THREE.Vector3(x, y, z).sub(pivot).applyQuaternion(quaternion).add(pivot);
  return [point.x, point.y, point.z];
}

export function studioEnvironmentRotation(azimuth: number, elevation: number): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(studioRigQuaternion(azimuth, elevation), 'YXZ');
  return [euler.x, euler.y + STUDIO_ENV_YAW, euler.z];
}
