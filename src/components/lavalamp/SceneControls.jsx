import React, { useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const SceneControls = () => {
  const controlsRef = useRef();
  const { camera } = useThree();

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping={true}
      dampingFactor={0.05}
      rotateSpeed={0.2}
      minDistance={4}
      maxDistance={15}
      enableZoom={true}
      enablePan={false}
      autoRotate={true}
      autoRotateSpeed={0.3}
      maxPolarAngle={Math.PI * 0.8}
      minPolarAngle={Math.PI * 0.2}
      camera={camera}
    />
  );
};

export default SceneControls;