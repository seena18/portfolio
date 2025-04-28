import React, { useRef } from 'react';
import { useLoader, useThree, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

const SceneModel = () => {
  // Replace with your model path
  const gltf = useLoader(GLTFLoader, '/src/assets/models/your_model.glb');
  const { camera } = useThree();
  const modelRef = useRef();
  
  // Set up the model when it loads
  React.useEffect(() => {
    if (gltf.scene) {
      // Calculate model bounds
      const modelBoundingBox = new THREE.Box3().setFromObject(gltf.scene);
      const modelSize = new THREE.Vector3();
      modelBoundingBox.getSize(modelSize);
      const modelCenter = new THREE.Vector3();
      modelBoundingBox.getCenter(modelCenter);
      
      console.log("Model dimensions:", modelSize);
      console.log("Model center:", modelCenter);
      
      // Position camera for optimal viewing
      camera.position.set(3, 1, 3);
      camera.lookAt(0, 0, 0);
    }
  }, [gltf, camera]);

  // Optional: Add animation
  useFrame((state, delta) => {
    if (modelRef.current) {
      // Gentle rotation
      modelRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />
      <primitive
        ref={modelRef}
        object={gltf.scene}
        scale={0.5}
        position={[0, 0, 0]}
      />
    </>
  );
};

export default SceneModel;