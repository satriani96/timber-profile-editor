import * as THREE from 'three';

export const CAMERA_PRESET_IDS = ['threeQuarter', 'threeQuarterOpposite', 'end', 'face', 'upright'] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export interface CameraPreset {
  label: string;
  title: string;
  azimuth: number;
  elevation: number;
  /** Stand the sample on its end, length vertical, instead of lying it along the ground. */
  upright: boolean;
}

const deg = (degrees: number) => (degrees * Math.PI) / 180;

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  threeQuarter: {
    label: '¾ view',
    title: 'End grain on the left, moulded face towards the camera',
    azimuth: deg(45),
    elevation: deg(14),
    upright: false,
  },
  threeQuarterOpposite: {
    label: '¾ other side',
    title: 'Opposite three-quarter: the other long face towards the camera',
    azimuth: deg(-45),
    elevation: deg(14),
    upright: false,
  },
  end: {
    label: 'End',
    title: 'Looking along the length at the end grain',
    azimuth: deg(12),
    elevation: deg(10),
    upright: false,
  },
  face: {
    label: 'Face',
    title: 'Moulded face towards the camera, length across the frame',
    azimuth: deg(90),
    elevation: deg(12),
    upright: false,
  },
  upright: {
    label: 'Upright',
    title: 'Stood on end, the top face of the drawing square to the camera',
    azimuth: 0,
    elevation: 0,
    upright: true,
  },
};

/** Where the sample sits in the studio and what the camera frames for a preset. */
export interface SampleStaging {
  /** Rotation about X applied to the mesh, which is built lying along Z on the ground. */
  rotationX: number;
  position: [number, number, number];
  /** Point the camera looks at. */
  target: [number, number, number];
  /** Half the extent the camera must keep in frame. */
  radius: number;
  /** Half the sample's footprint on the ground, in X and Z, for the shadow catcher. */
  footprint: [number, number];
}

/**
 * The mesh is built lying down: profile in XY with its bottom on the ground, length along Z
 * centred on the origin. Upright turns it a quarter about X so the length runs up the frame
 * and the top face of the drawing (+Y) turns to face +Z, which is where an azimuth of 0 puts
 * the camera; it is lifted to stand on its lower end and centred on its thickness.
 */
export function stageSample(preset: CameraPreset, width: number, height: number, length: number): SampleStaging {
  if (preset.upright) {
    return {
      rotationX: Math.PI / 2,
      position: [0, length / 2, -height / 2],
      target: [0, length / 2, 0],
      // Seen square on, the length runs up the frame and the profile's width across it.
      radius: Math.max(length, width) / 2,
      footprint: [width / 2, height / 2],
    };
  }
  return {
    rotationX: 0,
    position: [0, 0, 0],
    target: [0, height / 2, 0],
    radius: Math.hypot(width, height, length) * 0.4,
    footprint: [width / 2, length / 2],
  };
}

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
