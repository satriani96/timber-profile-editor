import { useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { profileBounds, type ProfileLoops } from './profileSolid';
import { createTimberMesh, disposeTimberMesh } from './timberMesh';

const AZIMUTH = Math.PI / 4;
const ELEVATION = (28 * Math.PI) / 180;
const FOV = 32;

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const texture = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = texture;
    envScene.dispose();
    return () => {
      scene.environment = null;
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
  const target = useMemo(() => new THREE.Vector3(0, height / 2, 0), [height]);
  const radius = Math.hypot(width, height, length) * 0.42;

  if (!mesh) return null;

  return (
    <>
      <FramedCamera target={target} radius={radius} />
      <StudioEnvironment />
      <ambientLight intensity={0.22} />
      <directionalLight position={[420, 520, 180]} intensity={1.45} color="#fff4e4" />
      <directionalLight position={[-320, 180, 80]} intensity={0.4} color="#d4deee" />
      <directionalLight position={[40, 260, -420]} intensity={0.58} color="#ffffff" />
      <primitive object={mesh} />
      <ContactShadows
        position={[0, 0.04, 0]}
        opacity={0.38}
        scale={Math.max(width, length) * 2.4}
        blur={2.4}
        far={Math.max(40, height + 20)}
        color="#3f2c18"
      />
    </>
  );
}

export default function TimberPreview({ loops, length }: { loops: ProfileLoops; length: number }) {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ fov: FOV, near: 0.5, far: 8000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#d6d0c6']} />
      <Scene loops={loops} length={length} />
    </Canvas>
  );
}
