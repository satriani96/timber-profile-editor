import { Suspense, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import * as THREE from 'three';
import { profileBounds, type ProfileLoops } from './profileSolid';
import type { GrainStyle } from './timberMaterial';
import { createTimberMesh, disposeTimberMesh } from './timberMesh';

/** 45° product view from a little above: end grain on the left, moulded face towards the camera. */
const AZIMUTH = (45 * Math.PI) / 180;
const ELEVATION = (14 * Math.PI) / 180;
/** ~85 mm-equivalent lens: the camera sits back so the piece keeps its width end to end, as catalogue shots of linear stock do. */
const FOV = 16;
const NEAR = 5;
const FAR = 6000;
/** Small photographic studio, CC0 from Poly Haven; shipped locally so the preview has no CDN dependency. */
const STUDIO_HDR = '/hdr/studio_small_09_1k.hdr';

function FramedCamera({ target, radius }: { target: THREE.Vector3; radius: number }) {
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
      target.x + dist * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
      target.y + dist * Math.sin(ELEVATION),
      target.z + dist * Math.cos(ELEVATION) * Math.cos(AZIMUTH)
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, radius, size.height, size.width, target]);
  return null;
}

function Scene({ loops, length, grain }: { loops: ProfileLoops; length: number; grain: GrainStyle }) {
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null);
  useLayoutEffect(() => {
    const next = createTimberMesh(loops, length, grain);
    setMesh(next);
    return () => {
      disposeTimberMesh(next);
      setMesh(null);
    };
  }, [grain, length, loops]);

  const bounds = profileBounds(loops);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Whole sample in frame, like a photographed offcut: near end grain on the left, far end
  // on the right, seen from slightly above.
  const target = useMemo(() => new THREE.Vector3(0, height / 2, 0), [height]);
  const radius = Math.hypot(width, height, length) * 0.4;
  const extent = Math.max(width, height, length);

  // Softbox key up and to the camera's right. A directional light with an orthographic shadow
  // camera sized to the piece gives even coverage (no cone edge) and lets the rebates and
  // undercuts shade themselves.
  const keyPosition: [number, number, number] = [extent * 1.1, extent * 1.4, extent * 0.9];

  if (!mesh) return null;

  return (
    <>
      <FramedCamera target={target} radius={radius} />
      {/* The HDR load suspends; keep that boundary local so the rest of the scene (and its
          layout effects) is not torn down and re-run while the file streams in. */}
      <Suspense fallback={null}>
        <Environment files={STUDIO_HDR} environmentIntensity={0.9} environmentRotation={[0, Math.PI * 0.35, 0]} />
      </Suspense>
      <directionalLight
        position={keyPosition}
        intensity={1.4}
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
      <directionalLight position={[-extent * 0.6, extent * 0.4, extent * 1.2]} intensity={0.3} color="#f2f4f8" />
      <primitive object={mesh} />
      {/* Ground shadow as a product sits on a white sweep. A dim, near-overhead light casts a
          wide-blurred VSM shadow onto a plane that shows nothing but the shadow it receives, so
          the pool sits directly under the piece and feathers out, and the background stays clear. */}
      <directionalLight
        // Slightly behind and above, so the pool spreads out in front of the piece towards the camera.
        position={[-extent * 0.3, extent * 2.2, -extent * 0.3]}
        intensity={0.2}
        color="#ffffff"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.001}
        shadow-normalBias={1.5}
        shadow-radius={45}
        shadow-blurSamples={20}
        shadow-camera-near={extent}
        shadow-camera-far={extent * 3.4}
        shadow-camera-left={-extent * 0.65}
        shadow-camera-right={extent * 0.65}
        shadow-camera-top={extent * 0.65}
        shadow-camera-bottom={-extent * 0.65}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow>
        <planeGeometry args={[length * 3, length * 3]} />
        <shadowMaterial transparent opacity={0.45} color="#2a1e12" />
      </mesh>
      {/* Ambient occlusion only. The depth-of-field effect writes an opaque alpha channel, which
          would kill the transparent background, so focus fall-off is left to the lens choice. */}
      <EffectComposer multisampling={8}>
        <N8AO aoRadius={extent * 0.06} distanceFalloff={extent * 0.12} intensity={1.6} quality="medium" />
      </EffectComposer>
    </>
  );
}

export default function TimberPreview({
  loops,
  length,
  grain = 'flat',
}: {
  loops: ProfileLoops;
  length: number;
  grain?: GrainStyle;
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
        toneMappingExposure: 1.1,
      }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      // Always render at 2x: on a 1x display this is supersampling, which is what sharpens the
      // fine grain and the arrises. The panel is small enough for this to be cheap.
      dpr={2}
    >
      <Scene loops={loops} length={length} grain={grain} />
    </Canvas>
  );
}
