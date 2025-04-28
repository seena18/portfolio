import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import LavaLampModel from './LavaLampModel';
import './Scene.css';

const LavaLampScene = () => {
  return (
    <div className="lava-lamp-container">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 20], fov: 40 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
        }}
      >
        {/* Changed to white background */}
        <color attach="background" args={['#ffffff']} />
        {/* Removed fog for clean white background */}
        
        <Suspense fallback={
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
        }>
          <LavaLampModel />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default LavaLampScene;