import React, { useRef, useState, useEffect } from 'react';
import { useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

const SC300Model = () => {
    const gltf = useLoader(GLTFLoader, '/src/assets/lexus_sc300_1993.glb');
    const { camera, scene, gl } = useThree();
    const modelRef = useRef();
    const controlsRef = useRef();
    const [highlightedPart, setHighlightedPart] = useState(null);
    const [highlightedPartName, setHighlightedPartName] = useState(null);
    
    // Store original materials to restore them later
    const originalMaterials = useRef(new Map());
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const carParts = useRef({});

    // Set up the model
    React.useEffect(() => {
        if (gltf.scene) {
            // First, calculate model bounds to understand its dimensions
            const modelBoundingBox = new THREE.Box3().setFromObject(gltf.scene);
            const modelSize = new THREE.Vector3();
            modelBoundingBox.getSize(modelSize);
            const modelCenter = new THREE.Vector3();
            modelBoundingBox.getCenter(modelCenter);
            
            console.log("Model dimensions:", modelSize);
            console.log("Model center:", modelCenter);
            
            // Initialize parts collection with common car parts
            carParts.current = {
                hood: [],
                roof: [],
                trunk: [],
                doors: [],
                side_mirrors: [],
                wheels: [],
                windows: [],
                lights: [],
                body: [] // catch-all for unclassified parts
            };
            
            // Store all meshes for analysis
            const allMeshes = [];
            gltf.scene.traverse(child => {
                if (child.isMesh) {
                    // Store original material
                    originalMaterials.current.set(child.uuid, child.material.clone());
                    
                    // Add to collection
                    allMeshes.push(child);
                    
                    // Compute geometry details
                    child.geometry.computeBoundingBox();
                    child.geometry.computeVertexNormals();
                }
            });
            
            // --- PHASE 1: IDENTIFY WHEELS (most recognizable parts) ---
            // Wheels are typically: round, at the bottom of the car, and symmetric
            
            // Sort all meshes by distance from bottom of car
            const bottomSortedMeshes = [...allMeshes].sort((a, b) => {
                const aBox = new THREE.Box3().setFromObject(a);
                const bBox = new THREE.Box3().setFromObject(b);
                return aBox.min.y - bBox.min.y;
            });
            
            // Get the lowest 20% of meshes as wheel candidates
            const wheelCandidates = bottomSortedMeshes.slice(0, Math.ceil(bottomSortedMeshes.length * 0.2));
            
            // Filter wheel candidates by roundness and size
            const wheels = wheelCandidates.filter(mesh => {
                // Compute circularity/roundness
                const bbox = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                
                // Near equal width/height is an indicator of roundness
                const aspectRatio = Math.max(size.x, size.z) / Math.min(size.x, size.z);
                
                // Small relative size compared to car
                const relativeSizeX = size.x / modelSize.x;
                const relativeSizeZ = size.z / modelSize.z;
                
                return aspectRatio < 1.5 && // Nearly circular
                       relativeSizeX < 0.3 && relativeSizeZ < 0.3 && // Not too big
                       relativeSizeX > 0.05 && relativeSizeZ > 0.05; // Not too small
            });
            
            // Add wheels to the parts collection
            wheels.forEach(wheel => {
                carParts.current.wheels.push(wheel);
                wheel.userData.partName = 'wheels';
            });
            
            // --- PHASE 2: IDENTIFY LARGE HORIZONTAL SURFACES (hood, roof, trunk) ---
            
            // Find surfaces with mostly upward-facing normals
            const horizontalSurfaces = allMeshes.filter(mesh => {
                if (carParts.current.wheels.includes(mesh)) return false; // Skip wheels
                
                // Check if normals point mostly upward
                const normals = mesh.geometry.attributes.normal;
                let upwardCount = 0;
                
                for (let i = 0; i < normals.count; i++) {
                    const normal = new THREE.Vector3(
                        normals.getX(i),
                        normals.getY(i),
                        normals.getZ(i)
                    ).normalize();
                    
                    // Transform normal to world space
                    normal.applyQuaternion(mesh.quaternion);
                    
                    // Count vertices with normals pointing up
                    if (normal.y > 0.7) upwardCount++;
                }
                
                // If more than 60% of normals point up, consider horizontal
                return upwardCount / normals.count > 0.6;
            });
            
            // Sort horizontal surfaces by X position (front to back)
            const sortedHorizontals = [...horizontalSurfaces].sort((a, b) => {
                const aPos = new THREE.Vector3();
                const bPos = new THREE.Vector3();
                
                a.getWorldPosition(aPos);
                b.getWorldPosition(bPos);
                
                return bPos.x - aPos.x; // Assuming car faces +X
            });
            
            // Divide horizontal surfaces into hood, roof, trunk based on position
            if (sortedHorizontals.length > 0) {
                const third = Math.ceil(sortedHorizontals.length / 3);
                
                // Front third is hood
                sortedHorizontals.slice(0, third).forEach(mesh => {
                    carParts.current.hood.push(mesh);
                    mesh.userData.partName = 'hood';
                });
                
                // Middle third is roof
                sortedHorizontals.slice(third, third * 2).forEach(mesh => {
                    carParts.current.roof.push(mesh);
                    mesh.userData.partName = 'roof';
                });
                
                // Rear third is trunk
                sortedHorizontals.slice(third * 2).forEach(mesh => {
                    carParts.current.trunk.push(mesh);
                    mesh.userData.partName = 'trunk';
                });
            }
            
            // --- PHASE 3: IDENTIFY WINDOWS ---
            
            // Windows typically have: transparent/glass material, thin profile
            const windowCandidates = allMeshes.filter(mesh => {
                if (Object.values(carParts.current).flat().includes(mesh)) return false; // Skip classified parts
                
                // Check material properties that might indicate glass
                const material = mesh.material;
                const isTransparent = material.transparent || material.opacity < 1;
                const isReflective = material.metalness > 0.7 || material.roughness < 0.2;
                
                // Geometry check - windows are typically thin
                const bbox = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const isRelativelyThin = size.y < modelSize.y * 0.15; // Thin compared to car height
                
                return (isTransparent || isReflective) && isRelativelyThin;
            });
            
            // Add windows to parts collection
            windowCandidates.forEach(mesh => {
                carParts.current.windows.push(mesh);
                mesh.userData.partName = 'windows';
            });
            
            // --- PHASE 4: IDENTIFY SIDE MIRRORS ---
            
            // Side mirrors are: small, on the sides, relatively high up
            const sideElements = allMeshes.filter(mesh => {
                if (Object.values(carParts.current).flat().includes(mesh)) return false; // Skip classified parts
                
                const bbox = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const center = new THREE.Vector3();
                bbox.getCenter(center);
                
                // Small relative size
                const isSmall = size.x < modelSize.x * 0.1 && 
                               size.y < modelSize.y * 0.1 && 
                               size.z < modelSize.z * 0.1;
                               
                // On the sides of the car
                const isOnSide = Math.abs(center.z) > modelSize.z * 0.4;
                
                // Mid-height on the car
                const isMidHeight = center.y > modelBoundingBox.min.y + modelSize.y * 0.3 &&
                                   center.y < modelBoundingBox.min.y + modelSize.y * 0.7;
                
                return isSmall && isOnSide && isMidHeight;
            });
            
            // Add side mirrors to parts collection
            sideElements.forEach(mesh => {
                carParts.current.side_mirrors.push(mesh);
                mesh.userData.partName = 'side_mirrors';
            });
            
            // --- PHASE 5: IDENTIFY DOORS ---
            
            // Doors are: vertical surfaces, on the sides, large
            const doorCandidates = allMeshes.filter(mesh => {
                if (Object.values(carParts.current).flat().includes(mesh)) return false; // Skip classified parts
                
                // Check if normals point mostly sideways
                const normals = mesh.geometry.attributes.normal;
                let sidewaysCount = 0;
                
                for (let i = 0; i < normals.count; i++) {
                    const normal = new THREE.Vector3(
                        normals.getX(i),
                        normals.getY(i),
                        normals.getZ(i)
                    ).normalize();
                    
                    // Transform normal to world space
                    normal.applyQuaternion(mesh.quaternion);
                    
                    // Count vertices with normals pointing sideways
                    if (Math.abs(normal.z) > 0.7) sidewaysCount++;
                }
                
                // If more than 60% of normals point sideways, consider vertical side panel
                const isSidePanel = sidewaysCount / normals.count > 0.6;
                
                // Calculate size and position to check if it's a door
                const bbox = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                
                // Doors are relatively large
                const isLarge = size.x > modelSize.x * 0.15 && size.y > modelSize.y * 0.25;
                
                return isSidePanel && isLarge;
            });
            
            // Add doors to parts collection
            doorCandidates.forEach(mesh => {
                carParts.current.doors.push(mesh);
                mesh.userData.partName = 'doors';
            });
            
            // --- PHASE 6: ASSIGN REMAINING PARTS TO BODY ---
            
            // Anything not classified goes to body
            allMeshes.forEach(mesh => {
                if (!Object.values(carParts.current).flat().includes(mesh)) {
                    carParts.current.body.push(mesh);
                    mesh.userData.partName = 'body';
                }
            });
            
            // Log results
            Object.entries(carParts.current).forEach(([partName, meshes]) => {
                console.log(`${partName}: ${meshes.length} meshes`);
            });
        }
    }, [gltf, camera, scene]);

    // Handle hover highlight
    useEffect(() => {
        // Create highlight material
        const highlightMaterial = new THREE.MeshStandardMaterial({
            color: 0x2194ce,
            emissive: 0x2194ce,
            emissiveIntensity: 0.4,
            metalness: 0.8,
            roughness: 0.2
        });

        // Mouse move handler
        const onMouseMove = (event) => {
            // Calculate mouse position in normalized device coordinates
            const canvas = gl.domElement;
            const rect = canvas.getBoundingClientRect();
            mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            // Update the raycaster
            raycaster.current.setFromCamera(mouse.current, camera);
            
            // Find intersections
            const intersects = raycaster.current.intersectObject(gltf.scene, true);
            
            // Reset previous highlight if any
            if (highlightedPart && highlightedPartName) {
                // Reset all meshes in the highlighted part
                carParts.current[highlightedPartName].forEach(mesh => {
                    const originalMaterial = originalMaterials.current.get(mesh.uuid);
                    if (originalMaterial) {
                        mesh.material = originalMaterial;
                    }
                });
                setHighlightedPart(null);
                setHighlightedPartName(null);
            }
            
            // Apply highlight to new part
            if (intersects.length > 0) {
                const object = intersects[0].object;
                if (object.isMesh && object.userData.partName) {
                    const partName = object.userData.partName;
                    
                    // Highlight all meshes in this part
                    carParts.current[partName].forEach(mesh => {
                        mesh.material = highlightMaterial;
                    });
                    
                    setHighlightedPart(object);
                    setHighlightedPartName(partName);
                    
                    // Show part name in formatted form
                    const formattedName = partName.split('_').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ');
                    
                    console.log(`Hovering over: ${formattedName}`);
                    
                    // You could also set this to state to display in UI
                    // setDisplayPartName(formattedName);
                }
            }
        };
        
        // Mouse leave handler
        const onMouseLeave = () => {
            // Reset highlight when mouse leaves canvas
            if (highlightedPart && highlightedPartName) {
                carParts.current[highlightedPartName].forEach(mesh => {
                    const originalMaterial = originalMaterials.current.get(mesh.uuid);
                    if (originalMaterial) {
                        mesh.material = originalMaterial;
                    }
                });
                setHighlightedPart(null);
                setHighlightedPartName(null);
            }
        };
        
        // Add event listeners
        const canvas = gl.domElement;
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        
        // Cleanup
        return () => {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [gl, camera, gltf.scene, highlightedPart, highlightedPartName]);

    // Add part name display overlay
    const PartNameOverlay = () => {
        if (!highlightedPartName) return null;
        
        const formattedName = highlightedPartName.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        
        return (
            <div style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '4px',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold'
            }}>
                {formattedName}
            </div>
        );
    };

    useFrame(() => {
        if (controlsRef.current) {
            controlsRef.current.update();
        }
    });

    return (
        <>
            <OrbitControls
                ref={controlsRef}
                enableDamping={true}
                dampingFactor={0.05}
                rotateSpeed={0.5}
                minDistance={2}
                maxDistance={10}
            />

            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />
            <primitive
                ref={modelRef}
                object={gltf.scene}
                scale={0.5}
                position={[0, 0, 0]}
            />
            {/* If you want to add a UI overlay for the part name, uncomment this */}
            {/* <PartNameOverlay /> */}
        </>
    );
};

export default SC300Model;