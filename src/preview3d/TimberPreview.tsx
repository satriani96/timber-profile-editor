import { Suspense, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import * as THREE from 'three';
import { profileBounds, type ProfileLoops } from './profileSolid';
import type { GrainDirection, GrainStyle } from './timberMaterial';
import { DEFAULT_FINISH, FINISHES, type Finish } from './finishes';
import { createTimberMesh, disposeTimberMesh } from './timberMesh';
import {
  CAMERA_PRESETS,
  type CameraPresetId,
  rotateStudioPoint,
  studioEnvironmentRotation,
  studioRigQuaternion,
} from './cameraPresets';

/** ~85 mm-equivalent lens: the camera sits back so the piece keeps its width end to end, as catalogue shots of linear stock do. */
const FOV = 16;
const NEAR = 5;
const FAR = 6000;
/** Small photographic studio, CC0 from Poly Haven; shipped locally so the preview has no CDN dependency. */
const STUDIO_HDR = '/hdr/studio_small_09_1k.hdr';

function FramedCamera({
  target,
  radius,
  azimuth,
  elevation,
}: {
  target: THREE.Vector3;
  radius: number;
  azimuth: number;
  elevation: number;
}) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = FOV;
    perspective.near = NEAR;
    perspective.far = FAR;
    const fov = (FOV * Math.PI) / 180;
    const aspect = size.width / size.height;
    const fit = radius * 1.12;
    const dist = Math.max(fit / Math.tan(fov / 2), fit / (Math.tan(fov / 2) * aspect));
    camera.position.set(
      target.x + dist * Math.cos(elevation) * Math.sin(azimuth),
      target.y + dist * Math.sin(elevation),
      target.z + dist * Math.cos(elevation) * Math.cos(azimuth)
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [azimuth, camera, elevation, radius, size.height, size.width, target]);
  return null;
}

interface SceneProps {
  loops: ProfileLoops;
  length: number;
  grain: GrainStyle;
  grainDirection: GrainDirection;
  finish: Finish;
  preset: CameraPresetId;
}

function Scene({ loops, length, grain, grainDirection, finish, preset }: SceneProps) {
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null);
  useLayoutEffect(() => {
    const next = createTimberMesh(loops, length, grain, finish, grainDirection);
    setMesh(next);
    return () => {
      disposeTimberMesh(next);
      setMesh(null);
    };
  }, [finish, grain, grainDirection, length, loops]);

  const bounds = profileBounds(loops);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const { azimuth, elevation } = CAMERA_PRESETS[preset];

  // Whole sample in frame, like a photographed offcut: near end grain on the left, far end
  // on the right, seen from slightly above.
  const target = useMemo(() => new THREE.Vector3(0, height / 2, 0), [height]);
  const radius = Math.hypot(width, height, length) * 0.4;
  const extent = Math.max(width, height, length);
  const rig = useMemo(() => studioRigQuaternion(azimuth, elevation), [azimuth, elevation]);
  const envRotation = useMemo(() => studioEnvironmentRotation(azimuth, elevation), [azimuth, elevation]);

  // Softbox key up and to the camera's right. Authored for the default three-quarter shot,
  // then rotated with the camera so every preset keeps the same catalogue lighting.
  const keyPosition = rotateStudioPoint(extent * 1.1, extent * 1.4, extent * 0.9, target, rig);
  const fillPosition = rotateStudioPoint(-extent * 0.6, extent * 0.4, extent * 1.2, target, rig);
  const shadowPosition = rotateStudioPoint(-extent * 0.7, extent * 2.0, -extent * 0.55, target, rig);

  if (!mesh) return null;

  return (
    <>
      <FramedCamera target={target} radius={radius} azimuth={azimuth} elevation={elevation} />
      {/* The HDR load suspends; keep that boundary local so the rest of the scene (and its
          layout effects) is not torn down and re-run while the file streams in. */}
      <Suspense fallback={null}>
        <Environment files={STUDIO_HDR} environmentIntensity={0.9} environmentRotation={envRotation} />
      </Suspense>
      {/* A directional light is a point source, so every highlight it makes is as small as the
          material's roughness allows: on a rounded arris that is a hard white line, which is
          the single biggest tell of a CG surface. The studio HDR has real softboxes in it and
          gives broad, soft, shaped reflections, so it carries the specular and this light is
          left to model the form and cast the shadow. */}
      <directionalLight
        position={keyPosition}
        intensity={0.85}
        color="#fffaf3"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={1.2}
        shadow-radius={12}
        shadow-blurSamples={16}
        shadow-camera-near={extent * 0.5}
        shadow-camera-far={extent * 4}
        shadow-camera-left={-extent * 0.7}
        shadow-camera-right={extent * 0.7}
        shadow-camera-top={extent * 0.7}
        shadow-camera-bottom={-extent * 0.7}
      />
      <directionalLight position={fillPosition} intensity={0.3} color="#f2f4f8" />
      <primitive object={mesh} />
      {/* Ground shadow as a product sits on a white sweep. A dim, near-overhead light casts a
          wide-blurred VSM shadow onto a plane that shows nothing but the shadow it receives, so
          the pool sits directly under the piece and feathers out, and the background stays clear. */}
      <directionalLight
        // Behind and above, so the pool is thrown one way: out in front of the piece towards the camera.
        position={shadowPosition}
        intensity={0.2}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.001}
        shadow-normalBias={1.5}
        shadow-radius={70}
        shadow-blurSamples={24}
        shadow-camera-near={extent}
        shadow-camera-far={extent * 3.4}
        // Generous frustum: the blurred pool must fade out inside it, not be cut by its edge.
        shadow-camera-left={-extent * 1.3}
        shadow-camera-right={extent * 1.3}
        shadow-camera-top={extent * 1.3}
        shadow-camera-bottom={-extent * 1.3}
      />
      {/* Oversized so its edge never crosses the frame (the AO pass would outline it). */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow>
        <planeGeometry args={[length * 40, length * 40]} />
        <shadowMaterial transparent opacity={0.45} color="#2a1e12" />
      </mesh>
      {/* Ambient occlusion only. The depth-of-field effect writes an opaque alpha channel, which
          would kill the transparent background, so focus fall-off is left to the lens choice. */}
      <EffectComposer multisampling={8}>
        <N8AO aoRadius={extent * 0.05} distanceFalloff={extent * 0.1} intensity={1.2} quality="medium" />
      </EffectComposer>
    </>
  );
}

export default function TimberPreview({
  loops,
  length,
  grain = 'flat',
  grainDirection = 'long',
  finish = FINISHES[DEFAULT_FINISH],
  preset,
}: {
  loops: ProfileLoops;
  length: number;
  grain?: GrainStyle;
  grainDirection?: GrainDirection;
  finish?: Finish;
  preset: CameraPresetId;
}) {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ fov: FOV, near: NEAR, far: FAR }}
      shadows="variance"
      gl={{
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.0,
      }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      // Always render at 2x: on a 1x display this is supersampling, which is what sharpens the
      // fine grain and the arrises. The panel is small enough for this to be cheap.
      dpr={2}
    >
      <Scene
        loops={loops}
        length={length}
        grain={grain}
        grainDirection={grainDirection}
        finish={finish}
        preset={preset}
      />
    </Canvas>
  );
}
