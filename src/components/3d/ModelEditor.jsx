import React, { useState, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { TransformControls, Html, OrbitControls } from '@react-three/drei'; // Add OrbitControls here
import * as THREE from 'three';

const ModelEditor = () => {
  const [tires, setTires] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [selectedTire, setSelectedTire] = useState(null);
  const transformRef = useRef();
  const { camera, scene } = useThree();
  const controlsRef = useRef();

  // Create a new tire
  const addTire = () => {
    const newTire = {
      id: Date.now(),
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      radius: 0.5,
      width: 0.15,
      color: '#ff0000'
    };
    setTires([...tires, newTire]);
    setSelectedTire(newTire.id);
  };

  // Remove a tire
  const removeTire = (id) => {
    setTires(tires.filter(tire => tire.id !== id));
    if (selectedTire === id) setSelectedTire(null);
  };

  // Update tire properties
  const updateTire = (id, updates) => {
    setTires(tires.map(tire => 
      tire.id === id ? { ...tire, ...updates } : tire
    ));
  };

  // Handle transform controls change
  const handleTransformChange = (e) => {
    if (selectedTire) {
      const object = e.target.object;
      const tire = tires.find(t => t.id === selectedTire);
      
      updateTire(selectedTire, {
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        scale: [object.scale.x, object.scale.y, object.scale.z]
      });
    }
  };

  return (
    <>
      {/* Editor UI */}
      <Html position={[-150, 10, 0]} style={{ width: '200px' }}>
        <div style={{ 
          backgroundColor: 'rgba(0,0,0,0.7)', 
          color: 'white', 
          padding: '10px',
          borderRadius: '5px'
        }}>
          <h3>Tire Editor</h3>
          <button 
            onClick={() => setEditMode(!editMode)}
            style={{ 
              backgroundColor: editMode ? '#4CAF50' : '#f44336',
              color: 'white',
              padding: '8px',
              marginBottom: '10px',
              width: '100%',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
          
          {editMode && (
            <>
              <button
                onClick={addTire}
                style={{ 
                  backgroundColor: '#2196F3',
                  color: 'white',
                  padding: '8px',
                  marginBottom: '10px',
                  width: '100%',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                Add New Tire
              </button>
              
              <div style={{ marginTop: '10px' }}>
                <h4>Tires ({tires.length})</h4>
                {tires.map(tire => (
                  <div key={tire.id} style={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '5px',
                    padding: '5px',
                    backgroundColor: selectedTire === tire.id ? 'rgba(255,255,255,0.2)' : 'transparent',
                    borderRadius: '3px'
                  }}>
                    <span 
                      onClick={() => setSelectedTire(tire.id)}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      Tire #{tire.id.toString().slice(-4)}
                    </span>
                    <button
                      onClick={() => removeTire(tire.id)}
                      style={{ 
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '2px 5px'
                      }}
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
              
              {selectedTire && (
                <div style={{ marginTop: '10px' }}>
                  <h4>Properties</h4>
                  {/* Color picker */}
                  <div style={{ marginBottom: '5px' }}>
                    <label style={{ display: 'block', marginBottom: '3px' }}>Color</label>
                    <input 
                      type="color" 
                      value={tires.find(t => t.id === selectedTire).color}
                      onChange={(e) => updateTire(selectedTire, { color: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  
                  {/* Radius slider */}
                  <div style={{ marginBottom: '5px' }}>
                    <label style={{ display: 'block', marginBottom: '3px' }}>
                      Radius: {tires.find(t => t.id === selectedTire).radius.toFixed(2)}
                    </label>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="1" 
                      step="0.05"
                      value={tires.find(t => t.id === selectedTire).radius}
                      onChange={(e) => updateTire(selectedTire, { radius: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  
                  {/* Width slider */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '3px' }}>
                      Width: {tires.find(t => t.id === selectedTire).width.toFixed(2)}
                    </label>
                    <input 
                      type="range" 
                      min="0.05" 
                      max="0.5" 
                      step="0.01"
                      value={tires.find(t => t.id === selectedTire).width}
                      onChange={(e) => updateTire(selectedTire, { width: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Html>
      
      {/* Render tires */}
      {tires.map(tire => (
        <group key={tire.id}>
          <mesh
            position={tire.position}
            rotation={tire.rotation}
            scale={tire.scale}
            onClick={() => editMode && setSelectedTire(tire.id)}
          >
            <cylinderGeometry args={[tire.radius, tire.radius, tire.width, 32]} />
            <meshStandardMaterial 
              color={tire.color} 
              roughness={0.3} 
              metalness={0.5}
              emissive={new THREE.Color(tire.color).multiplyScalar(0.2)}
              side={THREE.DoubleSide}
            />
          </mesh>
          
          {/* Hub cap */}
          <mesh
            position={tire.position}
            rotation={tire.rotation}
            scale={tire.scale}
          >
            <cylinderGeometry args={[tire.radius * 0.3, tire.radius * 0.3, tire.width * 1.1, 16]} />
            <meshStandardMaterial 
              color="#dddddd" 
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
          
          {/* Transform controls for selected tire */}
          {editMode && selectedTire === tire.id && (
            <TransformControls
              ref={transformRef}
              object={document.querySelector(`mesh[data-tire-id="${tire.id}"]`)}
              position={tire.position}
              rotation={tire.rotation}
              scale={tire.scale}
              onObjectChange={handleTransformChange}
              mode="translate" // 'translate', 'rotate', or 'scale'
              size={1}
            />
          )}
        </group>
      ))}
    </>
  );
};

export default ModelEditor;