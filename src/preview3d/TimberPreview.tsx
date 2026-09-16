import { Suspense, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { DepthOfField, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { profileBounds, type ProfileLoops } from './profileSolid';
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

function Scene({ loops, length }: { loops: ProfileLoops; length: number }) {
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null);
  useLayoutEffect(() => {
    const next = createTimberMesh(loops, length);
    setMesh(next);
    return () => {
      disposeTimberMesh(next);
      setMesh(null);
    };
  }, [length, loops]);

  const bounds = profileBounds(loops);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Whole sample in frame, like a photographed offcut: near end grain on the left, far end
  // on the right, seen from slightly above.
  const target = useMemo(() => new THREE.Vector3(0, height / 2, 0), [height]);
  const radius = Math.hypot(width, height, length) * 0.4;
  const extent = Math.max(width, height, length);
  // Focus on the near end so the far end drifts gently soft, as a macro lens would.
  const focus = useMemo(() => new THREE.Vector3(width / 2, height / 2, length * 0.25), [width, height, length]);

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
        shadow-radius={5}
        shadow-blurSamples={12}
        shadow-camera-near={extent * 0.5}
        shadow-camera-far={extent * 4}
        shadow-camera-left={-extent * 0.7}
        shadow-camera-right={extent * 0.7}
        shadow-camera-top={extent * 0.7}
        shadow-camera-bottom={-extent * 0.7}
      />
      <directionalLight position={[-extent * 0.6, extent * 0.4, extent * 1.2]} intensity={0.3} color="#f2f4f8" />
      <primitive object={mesh} />
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={extent * 0.06} distanceFalloff={extent * 0.12} intensity={1.6} quality="medium" />
        {/* Barely-there focus fall-off: the whole piece stays sharp, the far end just loses its edge. */}
        <DepthOfField target={focus} worldFocusRange={extent * 1.3} bokehScale={0.8} resolutionScale={1} />
        <Vignette eskil={false} offset={0.25} darkness={0.3} />
      </EffectComposer>
    </>
  );
}

export default function TimberPreview({ loops, length }: { loops: ProfileLoops; length: number }) {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ fov: FOV, near: NEAR, far: FAR }}
      shadows="variance"
      gl={{
        antialias: false,
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.1,
      }}
      // Always render at 2x: on a 1x display this is supersampling, which is what sharpens the
      // fine grain and the arrises. The panel is small enough for this to be cheap.
      dpr={2}
    >
      <color attach="background" args={['#ffffff']} />
      <Scene loops={loops} length={length} />
    </Canvas>
  );
}
