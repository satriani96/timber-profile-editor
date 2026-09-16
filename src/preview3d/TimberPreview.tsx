import { useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { profileBounds, type ProfileLoops } from './profileSolid';
import { createTimberMesh, disposeTimberMesh } from './timberMesh';

const AZIMUTH = (38 * Math.PI) / 180;
const ELEVATION = (24 * Math.PI) / 180;
const FOV = 30;
/** How much of the length is framed; the rest runs out of the picture. */
const FRAMED_LENGTH_MM = 280;

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const texture = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = 0.75;
    envScene.dispose();
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function FramedCamera({
  target,
  radius,
}: {
  target: THREE.Vector3;
  radius: number;
}) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = FOV;
    perspective.near = 0.5;
    perspective.far = 8000;
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

  // Product-shot framing: the near end sits in the lower left and the length runs out of the
  // frame, so the profile and end grain fill the picture rather than a whole short stick.
  const visible = Math.max(FRAMED_LENGTH_MM, Math.max(width, height) * 1.6);
  const nearEnd = length / 2;
  const target = useMemo(
    () => new THREE.Vector3(0, height / 2, nearEnd - visible * 0.5),
    [height, nearEnd, visible]
  );
  const radius = Math.hypot(width, height, visible) * 0.46;
  const extent = Math.max(width, height, visible);
  // Physically based spot: intensity scales with distance² so the piece reads the same at any size.
  const keyOffset: [number, number, number] = [extent * 0.7, extent * 1.3, extent * 0.9];
  const keyDistance = Math.hypot(...keyOffset);
  // A spot aims at an Object3D that must live in the scene for its matrix to update.
  const keyTarget = useMemo(() => new THREE.Object3D(), []);

  if (!mesh) return null;

  return (
    <>
      <FramedCamera target={target} radius={radius} />
      <StudioEnvironment />
      <group position={[0, 0, target.z]}>
        <primitive object={keyTarget} position={[0, height / 2, 0]} />
        <spotLight
          target={keyTarget}
          position={keyOffset}
          intensity={1.9 * keyDistance * keyDistance}
          color="#fff6ea"
          angle={0.8}
          penumbra={0.9}
          decay={2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.6}
          shadow-camera-near={extent * 0.3}
          shadow-camera-far={extent * 6}
          shadow-radius={8}
        />
        <directionalLight position={[-extent, extent * 0.6, extent * 0.5]} intensity={0.55} color="#eef2f8" />
        <directionalLight position={[extent * 0.3, extent * 0.9, -extent * 1.4]} intensity={0.7} color="#ffffff" />
        <ContactShadows
          position={[0, 0.02, 0]}
          opacity={0.32}
          scale={Math.max(width, visible) * 3}
          blur={2.6}
          far={Math.max(40, height + 20)}
          resolution={1024}
          color="#3a2a18"
        />
      </group>
      <primitive object={mesh} />
    </>
  );
}

export default function TimberPreview({ loops, length }: { loops: ProfileLoops; length: number }) {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ fov: FOV, near: 0.5, far: 8000 }}
      shadows="soft"
      gl={{
        antialias: true,
        alpha: true,
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.0,
      }}
      dpr={[1, 2]}
    >
      <Scene loops={loops} length={length} />
    </Canvas>
  );
}
