import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import LavaLampModel from './LavaLampModel';
import './Scene.css';

// Main scene component - no color picker functionality
const LavaLampScene = ({ baseColor, highlightColor, backgroundColor }) => {
  return (
    <div className="lava-lamp-container">
      {/* Three.js Canvas */}
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
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <color attach="background" args={[backgroundColor.r, backgroundColor.g, backgroundColor.b]} />

        <Suspense fallback={
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
        }>
          <LavaLampModel
            baseColor={baseColor}
            highlightColor={highlightColor}
            backgroundColor={backgroundColor}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default LavaLampScene;