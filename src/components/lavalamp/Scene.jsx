import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import LavaLampModel from './LavaLampModel';
import './Scene.css';

// Main scene component with responsive sizing
const LavaLampScene = ({ baseColor, highlightColor, backgroundColor }) => {
  // Add state to track viewport size
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    aspectRatio: window.innerWidth / window.innerHeight
  });
  
  // Calculate optimal camera parameters based on screen size
  const getCameraSettings = () => {
    // Adjust field of view for different screen sizes
    let fov = 40; // Default FOV
    let position = [0, 0, 20]; // Default camera position
    
    // For mobile devices (narrow screens)
    if (viewport.width < 768) {
      fov = 50; // Wider FOV on small screens to see more
      position = [0, 0, 18]; // Closer camera on small screens
    } 
    // For tablets
    else if (viewport.width < 1024) {
      fov = 45;
      position = [0, 0, 19];
    }
    // For ultra-wide screens
    else if (viewport.aspectRatio > 2) {
      fov = 35; // Narrower FOV on wide screens
      position = [0, 0, 22]; // Further away on wide screens
    }
    
    return { position, fov };
  };
  
  // Update viewport size on resize
  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        aspectRatio: window.innerWidth / window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Get camera settings based on current viewport
  const cameraSettings = getCameraSettings();

  return (
    <div className="lava-lamp-container">
      {/* Three.js Canvas with responsive camera */}
      <Canvas
        dpr={[1, Math.min(2, window.devicePixelRatio)]} // Limit DPR for performance
        camera={{ 
          position: cameraSettings.position, 
          fov: cameraSettings.fov 
        }}
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
            viewport={viewport} // Pass viewport info to the model
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default LavaLampScene;