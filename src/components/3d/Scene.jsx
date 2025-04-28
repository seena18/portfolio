import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import SC300Model from './Models';
import ModelEditor from './ModelEditor';
import './Scene.css';

const Scene = () => {
  return (
    <div className="scene-container">
      <Canvas>
        <Suspense fallback={null}>
          <SC300Model />
          <ModelEditor />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default Scene;