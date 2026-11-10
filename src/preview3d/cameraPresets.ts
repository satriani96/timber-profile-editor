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
  /**
   * Where the key softbox sits. Catalogue is the three-quarter studio key, turned with the
   * camera. Raking skims it across the face from the camera's right, so every step, groove
   * and bead casts a short shadow across the face; seen square on, that is the only thing
   * that shows the profile's relief.
   */
  key: KeyLight;
}

export type KeyLight = 'catalogue' | 'raking';

const deg = (degrees: number) => (degrees * Math.PI) / 180;

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  threeQuarter: {
    label: '¾ view',
    title: 'End grain on the left, moulded face towards the camera',
    azimuth: deg(45),
    elevation: deg(14),
    upright: false,
    key: 'catalogue',
  },
  threeQuarterOpposite: {
    label: '¾ other side',
    title: 'Opposite three-quarter: the other long face towards the camera',
    azimuth: deg(-45),
    elevation: deg(14),
    upright: false,
    key: 'catalogue',
  },
  end: {
    label: 'End',
    title: 'Looking along the length at the end grain',
    azimuth: deg(12),
    elevation: deg(10),
    upright: false,
    key: 'catalogue',
  },
  face: {
    label: 'Face',
    title: 'Moulded face towards the camera, length across the frame',
    azimuth: deg(90),
    elevation: deg(12),
    upright: false,
    key: 'catalogue',
  },
  upright: {
    label: 'Upright',
    title: 'Stood on end, the top face of the drawing square to the camera',
    azimuth: 0,
    elevation: 0,
    upright: true,
    key: 'raking',
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

/**
 * Raking key in the camera's own frame: well out to its right, a little above and only a
 * little in front, so the light meets a face square to the camera about 20 degrees off its
 * surface. Lower and the face falls into shade; higher and the relief stops casting shadows.
 */
const RAKING_KEY = { right: 1.4, up: 0.5, towardCamera: 0.5 };

/** Position of the key softbox for a preset, around the point the camera looks at. */
export function keyLightPosition(
  preset: CameraPreset,
  target: THREE.Vector3,
  extent: number
): [number, number, number] {
  if (preset.key === 'catalogue') {
    // Softbox key up and to the camera's right. Authored for the default three-quarter shot,
    // then rotated with the camera so every preset keeps the same catalogue lighting.
    const rig = studioRigQuaternion(preset.azimuth, preset.elevation);
    return rotateStudioPoint(extent * 1.1, extent * 1.4, extent * 0.9, target, rig);
  }
  const toCamera = cameraDirection(preset.azimuth, preset.elevation);
  const right = new THREE.Vector3(0, 1, 0).cross(toCamera).normalize();
  const up = toCamera.clone().cross(right);
  const point = target
    .clone()
    .addScaledVector(right, extent * RAKING_KEY.right)
    .addScaledVector(up, extent * RAKING_KEY.up)
    .addScaledVector(toCamera, extent * RAKING_KEY.towardCamera);
  return [point.x, point.y, point.z];
}

export function studioEnvironmentRotation(azimuth: number, elevation: number): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(studioRigQuaternion(azimuth, elevation), 'YXZ');
  return [euler.x, euler.y + STUDIO_ENV_YAW, euler.z];
}
