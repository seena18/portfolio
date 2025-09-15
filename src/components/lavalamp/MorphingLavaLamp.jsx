import { useRef, useEffect, useState, lazy, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';

// Keep your addBalls prototype method
THREE.Object3D.prototype.addBalls = function (arr, subtract) {
    const fld = this.field;
    const scl = this.resolution;
    const inv = 1 / scl;
    for (let i = 0; i < arr.length; i++) {
        const [x, y, z, strength] = arr[i];
        this.addBall(x, y, z, strength, subtract, fld, scl, inv);
    }
};

// Add simulation step constant
const SIM_STEP = 1 / 20; // Reduced to 20Hz from 30Hz

// Simulation constants
const CONTAINER_HEIGHT = 16; // Increased from 12
const CONTAINER_RADIUS = 4.5; // Increased from 3
const BUFFER_ZONE = 0.2; // Keep the same buffer zone percentage

// Updated constants for more dynamic base animation
const RESOLUTION = 100; // Reduced from 128 for better performance
const NUM_METABALLS = 1; // Only one morphing metaball
const NUM_SUPPORT_BALLS = 3; // Increased for more dynamic base
const NUM_FREE_PARTICLES = 4; // Added back for more dynamic base animation

// Increase isolation for smoother surface
const ISOLATION = 80; // Reduced from 150 to create a larger surface

// Reduce asymmetry for more cohesive main blob
const ASYMMETRY_FACTOR = 1.5; // Reduced from 3
const INTERNAL_WARP_STRENGTH = 1.0; // Reduced from 3

// Simplify shape for smoother appearance
const ELONGATION_FACTOR = 0.8; // Reduced for less stretching
const SHAPE_COMPLEXITY = 1; // Keep minimal for smoother appearance
const DISTORTION_AMOUNT = 0.1; // Reduced from 0.15 for smoother surface

// Reduce jiggling for more stable main mass
const JIGGLE_INTENSITY = 0.6; // Reduced from 1.0

// Add this constant for mouse interaction
const MOUSE_REPULSION_STRENGTH = 0.3; // Reduced from 4.0 to 0.3
const MOUSE_TRAIL_LENGTH = 4; // Fewer points in trail
const MOUSE_TRAIL_DECAY = 0.6; // Faster decay
const MOUSE_TRAIL_WIDTH = 0.15; // Width of the cutting trail

// First, modify your initialization effect to make a cleaner separation between
// material creation and simulation state

// Add this function outside the component to keep shader code consistent
const createLavaLampMaterial = (baseColor, highlightColor) => {
    return new THREE.ShaderMaterial({
        uniforms: {
            uBaseColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
            uHighlightColor: { value: new THREE.Vector3(highlightColor.r, highlightColor.g, highlightColor.b) }
        },
        vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
        fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform vec3 uBaseColor;
      uniform vec3 uHighlightColor;
      
      void main() {
        // Use uniform colors instead of hardcoded values
        vec3 baseColor = uBaseColor;
        vec3 highlightColor = uHighlightColor;
        
        // Calculate fresnel effect for edge highlighting
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);
        
        // Create gradient based on viewing angle
        vec3 finalColor = mix(baseColor, highlightColor, fresnel);
        
        // Less translucent overall
        float opacity = 0.95 - fresnel * 0.15;
        
        gl_FragColor = vec4(finalColor, opacity);
      }
    `,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: true,
        side: THREE.DoubleSide
    });
};
const MorphingLavaLamp = ({ baseColor, highlightColor, backgroundColor, portfolioData, viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    aspectRatio: window.innerWidth / window.innerHeight
} }) => {
    // Add navigation hook
    const navigate = useNavigate();
    const mouseTrail = useRef([]);
    const mouseVelocity = useRef(new THREE.Vector2(0, 0));
    const prevMousePos = useRef(new THREE.Vector2(0, 0));
    const isDragging = useRef(false);
    
    // Add scroll and morphing state
    const [scrollProgress, setScrollProgress] = useState(0);
    const [morphingProgress, setMorphingProgress] = useState(0);
    const [currentSection, setCurrentSection] = useState(0);
    const scrollAccumulator = useRef(0);
    const metaballPositions = useRef([]);
    const cardPositions = useRef([]);


    // Define portfolio sections for navigation with card data
    const portfolioSections = [
        { 
            id: 0, 
            name: "Projects", 
            path: "/projects", 
            color: new THREE.Color(0x111111),
            title: "Featured Projects",
            description: "Explore my latest work including web applications, 3D experiences, and creative coding projects.",
            items: [
                "React Three Fiber Portfolio",
                "E-commerce Platform",
                "3D Data Visualization"
            ]
        },
        { 
            id: 1, 
            name: "About", 
            path: "/about", 
            color: new THREE.Color(0x222222),
            title: "About Me",
            description: "Full-stack developer with a passion for creating immersive digital experiences using cutting-edge technologies.",
            items: [
                "5+ Years Experience",
                "React/Three.js Specialist",
                "UI/UX Design"
            ]
        },
        { 
            id: 2, 
            name: "Skills", 
            path: "/skills", 
            color: new THREE.Color(0x333333),
            title: "Technical Skills",
            description: "Proficient in modern web technologies, 3D graphics programming, and creative development tools.",
            items: [
                "JavaScript/TypeScript",
                "React/Next.js",
                "Three.js/WebGL"
            ]
        }
    ];

    // Add state for hover feedback
    const [hoveredSection, setHoveredSection] = useState(null);
    const blobPositions = useRef(Array(NUM_METABALLS).fill(new THREE.Vector3()));
    const blobStrengths = useRef(Array(NUM_METABALLS).fill(0));

    const { camera, gl, scene } = useThree();
    const [stats, setStats] = useState({ fps: 0 });

    // Add these missing mouse interaction states and refs
    const [mouseActive, setMouseActive] = useState(false);
    const mousePos = useRef(new THREE.Vector2());
    const raycaster = useRef(new THREE.Raycaster());
    const mouse3D = useRef(new THREE.Vector3());

    // Add these arrays to track previous positions for velocity-based stretching
    const [prevDirX] = useState(Array(NUM_METABALLS).fill(0));
    const [prevDirY] = useState(Array(NUM_METABALLS).fill(0));
    const [prevDirZ] = useState(Array(NUM_METABALLS).fill(0));

    // Store our marching cubes instance
    const marchingCubesRef = useRef();

    // Update the simRef to include random initial time but keep all other settings intact
    const simRef = useRef({
        initialized: false,
        clock: new THREE.Clock(),
        lastTime: 0,
        time: Math.random() * 100,
        speed: 0.15, // Slightly slower for more controlled movement
        strength: 2.5, // Increased significantly for visibility
        subtract: 12, // Decreased from 30
        baseTemp: 0.1,
        cycleSpeed: 0.02, // Slower cycles for more dramatic blob ejection/return
        // Rest of configuration remains the same
        phaseOffsets: {
            x: Math.random() * Math.PI * 2,
            y: Math.random() * Math.PI * 2,
            z: Math.random() * Math.PI * 2
        },
        positions: [],
        strengths: [],
        // Performance tracking
        frameCount: 0,
        lastFpsUpdate: 0
    });

    // Add these new state variables to store positioning data
    // const [savedPositionState, setSavedPositionState] = useState(null);

    // Update your savedPositionState to better preserve metaball positions


    useEffect(() => {
        if (!marchingCubesRef.current) return;

        try {
            // Just update material uniforms directly - no rebuilding
            if (marchingCubesRef.current.material &&
                marchingCubesRef.current.material.uniforms) {

                // Update color values
                marchingCubesRef.current.material.uniforms.uBaseColor.value.set(
                    baseColor.r, baseColor.g, baseColor.b
                );

                marchingCubesRef.current.material.uniforms.uHighlightColor.value.set(
                    highlightColor.r, highlightColor.g, highlightColor.b
                );

                // Mark material as needing update
                marchingCubesRef.current.material.needsUpdate = true;

                // Update background color
                gl.setClearColor(
                    new THREE.Color(backgroundColor.r, backgroundColor.g, backgroundColor.b),
                    1.0
                );

                console.log("Updated colors via uniforms");
            } else {
                console.warn("Material not ready for uniform updates");
            }
        } catch (error) {
            console.error("Error updating material colors:", error);
        }
    }, [baseColor, highlightColor, backgroundColor]);

    // In the initialization effect, improve the restoration logic
    useEffect(() => {
        // Only load MarchingCubes when needed
        if (!marchingCubesRef.current) {
            import('three/examples/jsm/objects/MarchingCubes.js').then(module => {
                const { MarchingCubes } = module;
                console.log("Initializing lava lamp with marching cubes");

                // Setup camera at fixed maximum distance
                camera.position.set(0, 0, 25);
                camera.lookAt(0, 0, 0);

                // Setup renderer with optimized settings
                gl.setPixelRatio(
                    window.innerWidth < 800 ? 1 : Math.min(window.devicePixelRatio, 1.5)
                );
                gl.setClearColor(
                    new THREE.Color(backgroundColor.r, backgroundColor.g, backgroundColor.b),
                    1.0
                );

                // Remove tone mapping for better performance
                gl.toneMapping = THREE.NoToneMapping;
                gl.toneMappingExposure = 1.2;

                // Create material with the custom shaders and color uniforms
                // Create simple test material for visibility debugging
                const lavaMaterial = new THREE.MeshLambertMaterial({ 
                    color: new THREE.Color(baseColor.r, baseColor.g, baseColor.b),
                    transparent: false,
                    opacity: 1.0
                });

                // Create marching cubes instance
                const effect = new MarchingCubes(
                    RESOLUTION,
                    lavaMaterial,
                    false,
                    false,
                    100000
                );

                // Add event listener to compute vertex normals only once per geometry update
                effect.addEventListener('render', () => {
                    effect.geometry.computeVertexNormals();
                });

                // Default initial position
                effect.position.set(0, 0, 0);

                // Set scale
                effect.scale.set(
                    CONTAINER_RADIUS * 2.2,
                    CONTAINER_RADIUS * 2.2,
                    CONTAINER_RADIUS * 2.2
                );

                effect.enableUvs = false;
                effect.enableColors = false;
                effect.isolation = ISOLATION;

                // Initialize with random positions
                for (let i = 0; i < NUM_METABALLS; i++) {
                    prevDirX[i] = (Math.random() * 0.4 - 0.2);
                    prevDirY[i] = (Math.random() * 0.4 - 0.2);
                    prevDirZ[i] = (Math.random() * 0.4 - 0.2);
                }

                scene.add(effect);
                marchingCubesRef.current = effect;

                // Create lighting
                createLighting(scene);

                // Start simulation - properly using simRef.current
                simRef.current.clock.start();
                simRef.current.initialized = true;

                // Run initial update
                updateMetaballs(
                    effect,
                    simRef.current.time,
                    NUM_METABALLS,
                    simRef.current.strength,
                    simRef.current.subtract
                );

                return () => {
                    if (marchingCubesRef.current) {
                        scene.remove(marchingCubesRef.current);
                        if (marchingCubesRef.current.material) {
                            marchingCubesRef.current.material.dispose();
                        }
                        if (marchingCubesRef.current.geometry) {
                            marchingCubesRef.current.geometry.dispose();
                        }
                    }
                };
            });
        }
    }, [camera, gl, scene]);

    // Add this before your component definition
    function updateMaterialColor(material, baseColor, highlightColor, gl, backgroundColor) {
        // Update uniforms directly without recreating material
        if (material && material.uniforms) {
            material.uniforms.uBaseColor.value.set(baseColor.r, baseColor.g, baseColor.b);
            material.uniforms.uHighlightColor.value.set(highlightColor.r, highlightColor.g, highlightColor.b);
            material.needsUpdate = true;

            // Update background without recreation
            gl.setClearColor(
                new THREE.Color(backgroundColor.r, backgroundColor.g, backgroundColor.b),
                1.0
            );
            return true;
        }
        return false;
    }

    // Inside your component, add a separate effect JUST for color changes
    // This effect should run INDEPENDENTLY of the main initialization effect
    useEffect(() => {
        if (!marchingCubesRef.current || !marchingCubesRef.current.material) return;

        console.log("Updating colors only - no rebuild");

        // Try to update just the material colors
        const success = updateMaterialColor(
            marchingCubesRef.current.material,
            baseColor,
            highlightColor,
            gl,
            backgroundColor
        );

        if (success) {
            console.log("Color update successful without rebuilding");
            // No rebuild needed
        } else {
            console.warn("Direct color update failed, falling back to rebuild");
            // Only if direct update fails, prepare for rebuild
            if (marchingCubesRef.current) {
                // Save state before rebuild
                // setSavedPositionState({
                //   position: marchingCubesRef.current.position.clone(),
                //   rotation: marchingCubesRef.current.rotation.clone(),
                //   isolation: marchingCubesRef.current.isolation,
                //   time: simRef.current.time,
                //   simState: {
                //     ...simRef.current,
                //     // Create a deep copy of important state
                //     positions: simRef.current.positions?.map(pos => ({ ...pos })) || [],
                //     strengths: [...(simRef.current.strengths || [])],
                //     lastTime: simRef.current.clock.getElapsedTime()
                //   },
                //   prevDirX: [...prevDirX],
                //   prevDirY: [...prevDirY],
                //   prevDirZ: [...prevDirZ],
                //   metaballPositions: blobPositions.current?.map(pos => pos.clone()) || [],
                //   metaballStrengths: [...(blobStrengths.current || [])]
                // });

                // Trigger rebuild only as last resort
                // setEffectKey(prev => prev + 1);
            }
        }
    }, [baseColor, highlightColor, backgroundColor]);

    // Add a separate effect for recreating the material entirely when base or highlight colors change
    useEffect(() => {
        if (!marchingCubesRef.current) return;

        try {
            const effect = marchingCubesRef.current;

            // Create a completely new material
            const newMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uBaseColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
                    uHighlightColor: { value: new THREE.Vector3(highlightColor.r, highlightColor.g, highlightColor.b) }
                },
                vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
                fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          uniform vec3 uBaseColor;
          uniform vec3 uHighlightColor;
          
          void main() {
            // Use uniform colors instead of hardcoded values
            vec3 baseColor = uBaseColor;
            vec3 highlightColor = uHighlightColor;
            
            // Calculate fresnel effect for edge highlighting
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);
            
            // Create gradient based on viewing angle
            vec3 finalColor = mix(baseColor, highlightColor, fresnel);
            
            // Less translucent overall
            float opacity = 0.95 - fresnel * 0.15;
            
            gl_FragColor = vec4(finalColor, opacity);
          }
        `,
                transparent: true,
                blending: THREE.NormalBlending,
                depthWrite: true,
                side: THREE.DoubleSide
            });

            // Dispose old material and replace with new
            marchingCubesRef.current.material.dispose();
            marchingCubesRef.current.material = newMaterial;

            // Update background color
            gl.setClearColor(
                new THREE.Color(backgroundColor.r, backgroundColor.g, backgroundColor.b),
                1.0
            );

            return; // Exit early, no need to rebuild
        } catch (error) {
            console.error("Error updating material:", error);
        }
    }, [baseColor, highlightColor]);

    // Fixed color conversion functions
    const hexToRgb = (hex) => {
        // Remove the # if present
        const cleanHex = hex.replace('#', '');

        return {
            r: parseInt(cleanHex.substring(0, 2), 16) / 255,
            g: parseInt(cleanHex.substring(2, 4), 16) / 255,
            b: parseInt(cleanHex.substring(4, 6), 16) / 255
        };
    };

    const rgbToHex = (r, g, b) => {
        const toHex = (c) => {
            const hex = Math.round(Math.max(0, Math.min(255, c * 255))).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    // Replace your existing ColorMenu component with this enhanced version

    // Add this after your first useEffect
    useEffect(() => {
        // Mouse interaction event handlers
        const handleMouseMove = (event) => {
            // Convert mouse position to normalized device coordinates (-1 to +1)
            const newMouseX = (event.clientX / window.innerWidth) * 2 - 1;
            const newMouseY = -(event.clientY / window.innerHeight) * 2 + 1;

            // Calculate velocity (how fast the mouse is moving)
            mouseVelocity.current.x = newMouseX - mousePos.current.x;
            mouseVelocity.current.y = newMouseY - mousePos.current.y;

            // Store previous mouse position before updating
            prevMousePos.current.x = mousePos.current.x;
            prevMousePos.current.y = mousePos.current.y;

            // Update current mouse position
            mousePos.current.x = newMouseX;
            mousePos.current.y = newMouseY;

            // If dragging, add to the trail
            if (isDragging.current) {
                // Update raycaster with new mouse position
                raycaster.current.setFromCamera(mousePos.current, camera);

                // Create a plane at z=0 to intersect with
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
                const intersectPoint = new THREE.Vector3();

                raycaster.current.ray.intersectPlane(plane, intersectPoint);

                // Scale to fit in our scene
                intersectPoint.divideScalar(10);

                // Only add new point if it's significantly different from the last one
                const trailLength = mouseTrail.current.length;
                const speed = Math.sqrt(
                    mouseVelocity.current.x * mouseVelocity.current.x +
                    mouseVelocity.current.y * mouseVelocity.current.y
                );

                if (trailLength === 0 ||
                    (trailLength > 0 &&
                        intersectPoint.distanceTo(mouseTrail.current[trailLength - 1].point) > 0.01)) {

                    // Add new point to trail with full strength
                    mouseTrail.current.push({
                        point: intersectPoint.clone(),
                        strength: MOUSE_REPULSION_STRENGTH * (0.5 + Math.min(speed * 5, 1.5)) // Stronger effect when moving faster
                    });

                    // Limit trail length
                    if (mouseTrail.current.length > MOUSE_TRAIL_LENGTH) {
                        mouseTrail.current.shift();
                    }
                }
            }
        };

        const handleMouseDown = (event) => {
            // Only activate on left-click
            if (event.button === 0) {
                setMouseActive(true);
                isDragging.current = true;

                // Clear previous trail
                mouseTrail.current = [];

                // Initialize trail with current position
                raycaster.current.setFromCamera(mousePos.current, camera);
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
                const intersectPoint = new THREE.Vector3();

                if (raycaster.current.ray.intersectPlane(plane, intersectPoint)) {
                    intersectPoint.divideScalar(10);
                    mouseTrail.current.push({
                        point: intersectPoint.clone(),
                        strength: MOUSE_REPULSION_STRENGTH
                    });
                }
            }
        };

        const handleMouseUp = () => {
            setMouseActive(false);
            isDragging.current = false;

            // Start decaying trail points but don't clear immediately for a smoother effect
            mouseTrail.current = mouseTrail.current.map(point => ({
                ...point,
                decaying: true // Mark for decay
            }));
        };

        // Add event listeners
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        // Cleanup
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [camera]);

    // Add scroll handling for morphing - cycling through single sections
    useEffect(() => {
        const handleWheel = (event) => {
            event.preventDefault();
            
            // Accumulate scroll delta with reduced sensitivity
            scrollAccumulator.current += event.deltaY * 0.003; // Further reduced for single section cycling
            
            // Calculate scroll progress (0-1 per section)
            const totalSections = portfolioSections.length;
            const rawProgress = Math.max(0, Math.min(scrollAccumulator.current, totalSections - 0.01));
            
            // Determine current section and progress within section
            const sectionIndex = Math.min(Math.floor(rawProgress), portfolioSections.length - 1);
            const sectionProgress = rawProgress - sectionIndex;
            
            setCurrentSection(sectionIndex);
            setScrollProgress(rawProgress);
            setMorphingProgress(sectionProgress);
            
            console.log(`Section: ${portfolioSections[sectionIndex].name}, Progress: ${sectionProgress.toFixed(3)}`);
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        
        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, [portfolioSections.length]);

    // Create lighting for the scene
    const createLighting = (scene) => {
        // Bright ambient light for white background
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);

        // Directional lights from different angles to create highlights on black metaballs
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
        mainLight.position.set(5, 5, 5);
        scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
        fillLight.position.set(-5, 0, -5);
        scene.add(fillLight);

        const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
        topLight.position.set(0, 10, 0);
        scene.add(topLight);

        // Add this point light
        const innerLight = new THREE.PointLight(0x404040, 1.5);
        innerLight.position.set(0, 0, 0);
        scene.add(innerLight);
    };

    // Process metaballs for marching cubes with morphing support
    const updateMetaballs = (effect, time, numMetaballs, strength, subtract) => {
        // Reset without conditional checks
        effect.reset();

        // Get current morphing state
        const morphProgress = morphingProgress;
        const sectionIndex = currentSection;
        
        // Calculate actual progress for morphing behaviors (needed early)
        const actualProgress = Math.min(1, Math.max(0, morphProgress * 1.2));
        
        // Store metaball positions for card morphing
        const currentMetaballPositions = [];

        // Add new non-spherical warping frequencies - reduce when morphing
        const morphMultiplier = 1 - morphProgress * 0.7; // Reduce animation as we morph
        const warpFreqX = time * 0.47 * morphMultiplier;
        const warpFreqY = time * 0.39 * morphMultiplier;
        const warpFreqZ = time * 0.53 * morphMultiplier;

        // Asymmetric warping values for all metaballs
        const globalWarpX = ASYMMETRY_FACTOR * Math.sin(warpFreqX) * morphMultiplier;
        const globalWarpY = ASYMMETRY_FACTOR * Math.sin(warpFreqY) * morphMultiplier;
        const globalWarpZ = ASYMMETRY_FACTOR * Math.sin(warpFreqZ) * morphMultiplier;

        // Cache expensive calculations and minimize math operations
        const baseTemp = simRef.current.baseTemp;
        const temp = baseTemp + 0.3 * Math.sin(time * simRef.current.cycleSpeed);

        // Modify these elongation factors to reduce vertical dominance
        const timeX = time * 0.13;
        const timeY = time * 0.12; // REDUCED from 0.17 and removed 1.5 offset that was making Y dominant
        const timeZ = time * 0.15; // REDUCED from 0.19

        // Balance the elongation between axes - make X and Z MORE elongated, Y LESS elongated
        const xElongation = 1.0 + 0.8 * Math.sin(timeX); // INCREASED from 0.7
        const yElongation = 1.0 + 0.5 * Math.sin(timeY); // REDUCED from 0.7
        const zElongation = 1.0 + 0.8 * Math.sin(timeZ); // INCREASED from 0.7

        // Reduce undulation amounts
        const xUndulation = 0.25 * Math.sin(time * 0.27) * Math.sin(time * 0.1); // Reduced from 0.3
        const yUndulation = 0.25 * Math.sin(time * 0.31 + 0.5) * Math.sin(time * 0.07); // Reduced from 0.3
        const zUndulation = 0.25 * Math.sin(time * 0.23 + 0.9) * Math.sin(time * 0.13); // Reduced from 0.3

        // Fixed center values - avoid recalculating
        const centerX = 0.5;
        const centerY = 0.5;
        const centerZ = 0.5;

        // Update the central blob to have undulation too
        const centerUndulationX = xUndulation * 0.3;
        const centerUndulationY = yUndulation * 0.3;
        const centerUndulationZ = zUndulation * 0.3;

        // Add slight movement to the center blob
        const movingCenterX = centerX + centerUndulationX;
        const movingCenterY = centerY + centerUndulationY;
        const movingCenterZ = centerZ + centerUndulationZ;

        // Add higher frequency jiggling components
        const jigglingFreq1 = time * 2.7; // Much higher frequency for jiggling
        const jigglingFreq2 = time * 3.2; // Second independent frequency
        const jigglingFreq3 = time * 2.3; // Third independent frequency

        // High-frequency, low-amplitude jiggling offsets
        const jiggleX = 0.03 * JIGGLE_INTENSITY * Math.sin(jigglingFreq1) * Math.sin(jigglingFreq2 * 0.7);
        const jiggleY = 0.03 * JIGGLE_INTENSITY * Math.sin(jigglingFreq2) * Math.sin(jigglingFreq3 * 0.7);
        const jiggleZ = 0.03 * JIGGLE_INTENSITY * Math.sin(jigglingFreq3) * Math.sin(jigglingFreq1 * 0.7);

        // Apply this jiggling to the center blob
        const finalCenterX = movingCenterX + jiggleX * 0.5;
        const finalCenterY = movingCenterY + jiggleY * 0.5;
        const finalCenterZ = movingCenterZ + jiggleZ * 0.5;

        // Central blob - SIGNIFICANTLY INCREASED strength for visibility
        effect.addBall(finalCenterX, finalCenterY, finalCenterZ, strength * 3.0, subtract); // Increased significantly for visibility

        // Supporting metaballs - MORE DYNAMIC with increased count
        for (let i = 0; i < NUM_SUPPORT_BALLS; i++) {
            const angle = i * 2.094 + time * (0.15 + i * 0.02); // Different speeds for each

            // Individual jiggling for each support ball - increased intensity
            const supportJiggleX = jiggleX * (1.5 + 0.7 * Math.sin(i * 2.1));
            const supportJiggleY = jiggleY * (1.5 + 0.7 * Math.cos(i * 1.7));
            const supportJiggleZ = jiggleZ * (1.5 + 0.7 * Math.sin(i * 1.3));

            // Create internal warp patterns unique to each support ball - more dramatic
            const internalWarpPhase = time * (1.5 + i * 0.3) + i * 2.1;
            const internalWarpX = INTERNAL_WARP_STRENGTH * 1.5 * Math.sin(internalWarpPhase * 1.1) * Math.cos(internalWarpPhase * 0.7);
            const internalWarpY = INTERNAL_WARP_STRENGTH * 1.5 * Math.sin(internalWarpPhase * 0.9) * Math.cos(internalWarpPhase * 1.3);
            const internalWarpZ = INTERNAL_WARP_STRENGTH * 1.5 * Math.sin(internalWarpPhase * 1.3) * Math.cos(internalWarpPhase * 0.5);

            // Variable orbit radius for more dynamic movement
            const orbitRadius = 0.08 + 0.06 * Math.sin(time * (0.8 + i * 0.2));
            const orbitHeight = 0.05 * Math.sin(time * (0.6 + i * 0.15));
            
            const px = centerX + Math.cos(angle) * orbitRadius * xElongation + supportJiggleX;
            const py = centerY + Math.sin(angle) * orbitRadius * yElongation + supportJiggleY + orbitHeight;
            const pz = centerZ + Math.sin(angle * 0.7) * orbitRadius * zElongation + supportJiggleZ;

            // Add the main metaball with varying strength
            const balls = [];
            const mainStrength = strength * (0.6 + 0.3 * Math.sin(time * (1.2 + i * 0.3)));
            balls.push([px, py, pz, mainStrength]);

            // Add 2-3 smaller neighboring balls to create non-spherical shapes
            // More dynamic secondary balls
            balls.push([
                px + internalWarpX * 0.09,
                py + internalWarpY * 0.07,
                pz + internalWarpZ * 0.08,
                mainStrength * 0.7,
            ]);
            
            // Add a third ball for even more complexity
            balls.push([
                px - internalWarpX * 0.05,
                py - internalWarpY * 0.04,
                pz + internalWarpZ * 0.06,
                mainStrength * 0.5,
            ]);

            // One batched call instead of many individual calls
            effect.addBalls(balls, subtract);
        }

        // Single satellite metaball with morphing support - section-specific animations
        // Only show one metaball that morphs to display current section
        const currentSectionIndex = Math.min(currentSection, portfolioSections.length - 1);
        const currentSectionData = portfolioSections[currentSectionIndex];
        
        // Section-specific morphing behaviors
        let morphingBehavior = {};
        switch (currentSectionIndex) {
            case 0: // Projects - Sharp, technical rectangle
                morphingBehavior = {
                    targetShape: 'rectangle',
                    rectWidth: 0.12 + (actualProgress * 0.12),
                    rectHeight: 0.16 + (actualProgress * 0.14),
                    rectDepth: 0.03 + (actualProgress * 0.02),
                    gridX: 6, gridY: 7, gridZ: 2,
                    cornerStrength: 1.3, edgeStrength: 1.1, centerStrength: 0.8,
                    approachStyle: 'linear', // Moves in straight line to center
                    distortionIntensity: 0.8
                };
                break;
            case 1: // About - Organic, rounded rectangle
                morphingBehavior = {
                    targetShape: 'rounded_rectangle',
                    rectWidth: 0.10 + (actualProgress * 0.10),
                    rectHeight: 0.14 + (actualProgress * 0.12),
                    rectDepth: 0.04 + (actualProgress * 0.03),
                    gridX: 5, gridY: 6, gridZ: 3,
                    cornerStrength: 1.0, edgeStrength: 1.2, centerStrength: 1.0,
                    approachStyle: 'spiral', // Spirals inward
                    distortionIntensity: 1.2
                };
                break;
            case 2: // Skills - Hexagonal/technical shape
                morphingBehavior = {
                    targetShape: 'hexagon',
                    rectWidth: 0.11 + (actualProgress * 0.11),
                    rectHeight: 0.11 + (actualProgress * 0.11), // More square
                    rectDepth: 0.02 + (actualProgress * 0.01),
                    gridX: 7, gridY: 6, gridZ: 2,
                    cornerStrength: 1.4, edgeStrength: 0.9, centerStrength: 0.7,
                    approachStyle: 'bounce', // Bouncy approach
                    distortionIntensity: 0.6
                };
                break;
            default:
                morphingBehavior = {
                    targetShape: 'rectangle',
                    rectWidth: 0.10 + (actualProgress * 0.10),
                    rectHeight: 0.14 + (actualProgress * 0.12),
                    rectDepth: 0.03 + (actualProgress * 0.02),
                    gridX: 5, gridY: 6, gridZ: 2,
                    cornerStrength: 1.2, edgeStrength: 1.0, centerStrength: 0.8,
                    approachStyle: 'linear',
                    distortionIntensity: 1.0
                };
        }
        
        // Calculate target position with section-specific approach
        const cardOffsetX = 0; // Always centered
        const cardOffsetY = 0;
        const cardOffsetZ = 1;
        const targetCardPos = new THREE.Vector3(cardOffsetX, cardOffsetY, cardOffsetZ);
        
        // Simplified lifecycle for the single metaball
        const lifecycleTime = time * 0.03;
        const radius = 0.15 + 0.1 * Math.sin(lifecycleTime);
        const ballStrength = strength * (0.8 + 0.2 * Math.cos(lifecycleTime * 0.7));

        // Apply morphing reduction to natural motion
        const morphedRadius = radius * (1 - morphProgress * 0.9);
        const reducedStrength = ballStrength * (1 - morphProgress * 0.3);

        // Section-specific positioning and approach
        let dirX, dirY, dirZ;
        const angle = time * 0.08 * morphMultiplier;
        const baseOrbitRadius = 0.2 + morphedRadius;
        
        switch (morphingBehavior.approachStyle) {
            case 'spiral':
                const spiralRadius = baseOrbitRadius * (1 - morphProgress);
                const spiralAngle = angle + morphProgress * Math.PI * 4; // Extra rotation as it spirals in
                dirX = Math.cos(spiralAngle) * spiralRadius;
                dirY = Math.sin(spiralAngle) * spiralRadius * 0.7;
                dirZ = Math.sin(spiralAngle * 0.3) * spiralRadius * 0.4;
                break;
            case 'bounce':
                const bounceRadius = baseOrbitRadius * (1 - morphProgress);
                const bounceEffect = Math.abs(Math.sin(morphProgress * Math.PI * 6)) * 0.1 * morphProgress;
                dirX = Math.cos(angle) * (bounceRadius + bounceEffect);
                dirY = Math.sin(angle) * (bounceRadius + bounceEffect) * 0.7;
                dirZ = Math.sin(angle * 0.3) * (bounceRadius + bounceEffect) * 0.4;
                break;
            default: // linear
                const orbitRadius = baseOrbitRadius * (1 - morphProgress);
                dirX = Math.cos(angle) * orbitRadius;
                dirY = Math.sin(angle) * orbitRadius * 0.7;
                dirZ = Math.sin(angle * 0.3) * orbitRadius * 0.4;
        }

        // Original metaball position
        const originalX = centerX + dirX;
        const originalY = centerY + dirY;
        const originalZ = centerZ + dirZ;

        // Convert card position to metaball space (0-1)
        const cardX = (targetCardPos.x / 20) + 0.5;
        const cardY = (targetCardPos.y / 20) + 0.5;
        const cardZ = (targetCardPos.z / 20) + 0.5;

        // Interpolate between original position and card position based on scroll progress
        // actualProgress already declared earlier in the function
        
        const ballx = THREE.MathUtils.lerp(originalX, cardX, actualProgress);
        const bally = THREE.MathUtils.lerp(originalY, cardY, actualProgress);
        const ballz = THREE.MathUtils.lerp(originalZ, cardZ, actualProgress);

        // Store position for card rendering - only one position now
        currentMetaballPositions[0] = {
            x: ballx,
            y: bally,
            z: ballz,
            progress: actualProgress,
            sectionData: currentSectionData
        };

        // Safety bounds
        const safeBallx = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, ballx));
        const safeBally = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, bally));
        const safeBallz = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, ballz));

        // Create metaball that morphs into section-specific shape
        const finalMorphedStrength = reducedStrength * (1 - actualProgress * 0.4);
        
        if (finalMorphedStrength > 0.05) {
            if (actualProgress > 0.3) {
                // Create section-specific shape using the morphing behavior
                const { rectWidth, rectHeight, rectDepth, gridX, gridY, gridZ, cornerStrength, edgeStrength, centerStrength } = morphingBehavior;
                
                // Strength distribution based on section
                const baseStrength = finalMorphedStrength * (0.7 + actualProgress * 0.4);
                const finalCornerStrength = baseStrength * cornerStrength;
                const finalEdgeStrength = baseStrength * edgeStrength;
                const finalCenterStrength = baseStrength * centerStrength;
                
                for (let gx = 0; gx < gridX; gx++) {
                    for (let gy = 0; gy < gridY; gy++) {
                        for (let gz = 0; gz < gridZ; gz++) {
                            let normalizedX = gx / Math.max(1, gridX - 1) - 0.5;
                            let normalizedY = gy / Math.max(1, gridY - 1) - 0.5;
                            let normalizedZ = gz / Math.max(1, gridZ - 1) - 0.5;
                            
                            // Apply shape-specific modifications
                            if (morphingBehavior.targetShape === 'hexagon') {
                                // Create hexagonal pattern
                                const hexDistance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
                                const hexAngle = Math.atan2(normalizedY, normalizedX);
                                const hexRadius = 0.85; // Slightly smaller than circle
                                if (hexDistance > hexRadius) continue; // Skip points outside hexagon
                                
                                // Modify positions to create hexagonal shape
                                const hexFactor = Math.cos(hexAngle * 3) * 0.1;
                                normalizedX += hexFactor * normalizedX;
                                normalizedY += hexFactor * normalizedY;
                            } else if (morphingBehavior.targetShape === 'rounded_rectangle') {
                                // Soften corners for rounded rectangle
                                const cornerDistance = Math.max(Math.abs(normalizedX), Math.abs(normalizedY));
                                if (cornerDistance > 0.8) {
                                    const softening = (cornerDistance - 0.8) * 2;
                                    normalizedX *= (1 - softening * 0.2);
                                    normalizedY *= (1 - softening * 0.2);
                                }
                            }
                            
                            const offsetX = normalizedX * rectWidth;
                            const offsetY = normalizedY * rectHeight;
                            const offsetZ = normalizedZ * rectDepth;
                            
                            const ballX = safeBallx + offsetX;
                            const ballY = safeBally + offsetY;
                            const ballZ = safeBallz + offsetZ;
                            
                            // Determine strength based on position
                            const isCorner = (gx === 0 || gx === gridX - 1) && (gy === 0 || gy === gridY - 1);
                            const isEdge = (gx === 0 || gx === gridX - 1) || (gy === 0 || gy === gridY - 1) || (gz === 0 || gz === gridZ - 1);
                            
                            let ballStrength;
                            if (isCorner) {
                                ballStrength = finalCornerStrength;
                            } else if (isEdge) {
                                ballStrength = finalEdgeStrength;
                            } else {
                                ballStrength = finalCenterStrength;
                            }
                            
                            // Ensure we're within bounds
                            if (ballX >= BUFFER_ZONE && ballX <= 1 - BUFFER_ZONE &&
                                ballY >= BUFFER_ZONE && ballY <= 1 - BUFFER_ZONE &&
                                ballZ >= BUFFER_ZONE && ballZ <= 1 - BUFFER_ZONE) {
                                effect.addBall(ballX, ballY, ballZ, ballStrength, subtract);
                            }
                        }
                    }
                }
            } else {
                // Transitional phase: section-specific distortion
                const distortionFactor = actualProgress / 0.3;
                const { distortionIntensity } = morphingBehavior;
                
                // Original circular metaball
                effect.addBall(safeBallx, safeBally, safeBallz, finalMorphedStrength, subtract);
                
                // Section-specific distortion patterns
                if (currentSectionIndex === 0) {
                    // Projects: Sharp, angular distortion
                    const stretchX = 0.08 * distortionFactor * distortionIntensity;
                    const stretchY = 0.10 * distortionFactor * distortionIntensity;
                    
                    const cornerPositions = [
                        [stretchX, stretchY, 0],
                        [-stretchX, stretchY, 0],
                        [stretchX, -stretchY, 0],
                        [-stretchX, -stretchY, 0],
                        [stretchX * 0.5, 0, stretchY * 0.5],
                        [-stretchX * 0.5, 0, stretchY * 0.5]
                    ];
                    
                    cornerPositions.forEach(([dx, dy, dz]) => {
                        const cornerX = safeBallx + dx;
                        const cornerY = safeBally + dy;
                        const cornerZ = safeBallz + dz;
                        
                        if (cornerX >= BUFFER_ZONE && cornerX <= 1 - BUFFER_ZONE &&
                            cornerY >= BUFFER_ZONE && cornerY <= 1 - BUFFER_ZONE &&
                            cornerZ >= BUFFER_ZONE && cornerZ <= 1 - BUFFER_ZONE) {
                            effect.addBall(cornerX, cornerY, cornerZ, finalMorphedStrength * 0.7 * distortionFactor, subtract);
                        }
                    });
                } else if (currentSectionIndex === 1) {
                    // About: Organic, flowing distortion
                    for (let i = 0; i < 8; i++) {
                        const organicAngle = (i / 8) * Math.PI * 2;
                        const organicRadius = 0.06 * distortionFactor * distortionIntensity;
                        const organicVariation = Math.sin(organicAngle * 3 + time) * 0.02;
                        
                        const dx = Math.cos(organicAngle) * (organicRadius + organicVariation);
                        const dy = Math.sin(organicAngle) * (organicRadius + organicVariation);
                        const dz = Math.sin(organicAngle * 2) * organicRadius * 0.5;
                        
                        const organicX = safeBallx + dx;
                        const organicY = safeBally + dy;
                        const organicZ = safeBallz + dz;
                        
                        if (organicX >= BUFFER_ZONE && organicX <= 1 - BUFFER_ZONE &&
                            organicY >= BUFFER_ZONE && organicY <= 1 - BUFFER_ZONE &&
                            organicZ >= BUFFER_ZONE && organicZ <= 1 - BUFFER_ZONE) {
                            effect.addBall(organicX, organicY, organicZ, finalMorphedStrength * 0.6 * distortionFactor, subtract);
                        }
                    }
                } else if (currentSectionIndex === 2) {
                    // Skills: Hexagonal distortion
                    for (let i = 0; i < 6; i++) {
                        const hexAngle = (i / 6) * Math.PI * 2;
                        const hexRadius = 0.07 * distortionFactor * distortionIntensity;
                        
                        const dx = Math.cos(hexAngle) * hexRadius;
                        const dy = Math.sin(hexAngle) * hexRadius;
                        const dz = 0;
                        
                        const hexX = safeBallx + dx;
                        const hexY = safeBally + dy;
                        const hexZ = safeBallz + dz;
                        
                        if (hexX >= BUFFER_ZONE && hexX <= 1 - BUFFER_ZONE &&
                            hexY >= BUFFER_ZONE && hexY <= 1 - BUFFER_ZONE &&
                            hexZ >= BUFFER_ZONE && hexZ <= 1 - BUFFER_ZONE) {
                            effect.addBall(hexX, hexY, hexZ, finalMorphedStrength * 0.8 * distortionFactor, subtract);
                        }
                    }
                }
            }
        }

        // Store current position for next frame (only one metaball now)
        prevDirX[0] = dirX;
        prevDirY[0] = dirY;
        prevDirZ[0] = dirZ;

        // Store metaball positions for card rendering
        metaballPositions.current = currentMetaballPositions;

        // Adjust isolation based on morphing progress for better rectangular definition
        const baseMorphProgress = Math.max(...currentMetaballPositions.map(pos => pos.progress || 0));
        if (baseMorphProgress > 0.3) {
            // Slightly increase isolation when morphing but not too much to avoid merging
            const dynamicIsolation = ISOLATION + (baseMorphProgress * 15); // Reduced from 40 to 15
            effect.isolation = dynamicIsolation;
        } else {
            effect.isolation = ISOLATION;
        }

        // MORE DYNAMIC free particles for visual richness
        for (let i = 0; i < NUM_FREE_PARTICLES; i++) {
            // Much more varied orbits and patterns
            const particlePhase = time * (0.3 + i * 0.15) + i * 1.57;
            const radiusOscillation = 0.15 + 0.12 * Math.sin(time * (0.8 + i * 0.1));
            
            // Figure-eight and orbital patterns
            const t1 = particlePhase * (1.0 + i * 0.2);
            const t2 = particlePhase * (0.7 + i * 0.1);
            
            let particleX, particleY, particleZ;
            
            if (i % 3 === 0) {
                // Figure-eight pattern
                particleX = centerX + radiusOscillation * Math.sin(t1) + jiggleX * 0.8;
                particleY = centerY + radiusOscillation * 0.7 * Math.sin(t1 * 2) + jiggleY * 0.8;
                particleZ = centerZ + radiusOscillation * 0.5 * Math.cos(t2) + jiggleZ * 0.8;
            } else if (i % 3 === 1) {
                // Helical spiral pattern
                particleX = centerX + radiusOscillation * Math.cos(t1) + jiggleX * 0.6;
                particleY = centerY + radiusOscillation * Math.sin(t1) + jiggleY * 0.6;
                particleZ = centerZ + radiusOscillation * 0.8 * Math.sin(t1 * 0.5) + jiggleZ * 0.6;
            } else {
                // Chaotic orbit with height variation
                const chaosX = Math.sin(t1 * 1.3) * Math.cos(t2 * 0.8);
                const chaosY = Math.cos(t1 * 1.1) * Math.sin(t2 * 1.2);
                const chaosZ = Math.sin(t1 * 0.9) * Math.sin(t2 * 0.6);
                
                particleX = centerX + radiusOscillation * chaosX + jiggleX * 1.2;
                particleY = centerY + radiusOscillation * chaosY + jiggleY * 1.2;
                particleZ = centerZ + radiusOscillation * 0.6 * chaosZ + jiggleZ * 1.2;
            }

            // Variable strength for breathing effect
            const particleStrength = strength * (0.15 + 0.1 * Math.sin(time * (2.0 + i * 0.5)));
            
            // Use BUFFER_ZONE to avoid edge clipping
            const safeX = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, particleX));
            const safeY = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, particleY));
            const safeZ = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, particleZ));
            
            // Add main particle
            effect.addBall(safeX, safeY, safeZ, particleStrength, subtract);
            
            // Some particles have trailing satellites for more organic feel
            if (i < 2) {
                const trailX = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, 
                    particleX - Math.sin(particlePhase) * 0.02));
                const trailY = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, 
                    particleY - Math.cos(particlePhase) * 0.015));
                const trailZ = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, 
                    particleZ - Math.sin(particlePhase * 0.7) * 0.018));
                effect.addBall(trailX, trailY, trailZ, particleStrength * 0.4, subtract);
            }
        }

        // Process mouse trail for cutting effect
        if (mouseTrail.current.length > 0) {
            // Process each point in the trail
            for (let i = mouseTrail.current.length - 1; i >= 0; i--) {
                const trailPoint = mouseTrail.current[i];

                // Decay handling
                if (trailPoint.decaying) {
                    trailPoint.strength *= 0.7;
                    if (trailPoint.strength < 0.3) {
                        mouseTrail.current.splice(i, 1);
                        continue;
                    }
                }

                // Convert to marching cubes space (0-1)
                const mx = (trailPoint.point.x + 1) * 0.5;
                const my = (trailPoint.point.y + 1) * 0.5;
                const mz = (trailPoint.point.z + 1) * 0.5;

                // GENTLE MOUSE INTERACTION
                // Just add a small indent where mouse is - no cutting
                effect.addBall(
                    mx, my, mz,
                    -strength * trailPoint.strength * 0.2, // Very gentle effect
                    subtract
                );
            }
        }

        // Update the marching cubes mesh
        effect.update();
    };

    // Initialize accumulator in the component, before useFrame
    const simAccumulator = useRef(0);

    // Modified useFrame implementation
    useFrame((state, delta) => {
        const sim = simRef.current;
        if (!sim.initialized) return;

        // Skip all animation when freezing
        if (sim.freezeAnimation) return;

        // Update mouse position - keep this outside throttling
        if (mousePos.current) {
            raycaster.current.setFromCamera(mousePos.current, camera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            const intersectPoint = new THREE.Vector3();
            raycaster.current.ray.intersectPlane(plane, intersectPoint);
            intersectPoint.divideScalar(10);
            mouse3D.current = intersectPoint;
        }

        // Get effect reference
        const effect = marchingCubesRef.current;
        if (!effect) return;

        // Current time for animation
        const currentTime = sim.clock.getElapsedTime();

        // Simple position updates occur every frame
        effect.position.x = Math.sin(currentTime * 0.2) * 0.1;
        effect.position.y = Math.sin(currentTime * 0.1) * 0.05;
        effect.position.z = Math.sin(currentTime * 0.17) * 0.1;

        // Simple rotation
        effect.rotation.y += 0.002;

        // THROTTLED UPDATES for heavy computation
        simAccumulator.current += delta;
        if (simAccumulator.current >= SIM_STEP) {
            simAccumulator.current -= SIM_STEP;

            // Update FPS counter (moved inside throttled section)
            sim.frameCount++;
            if (currentTime - sim.lastFpsUpdate > 0.5) {
                setStats({
                    fps: Math.round(sim.frameCount / (currentTime - sim.lastFpsUpdate))
                });
                sim.frameCount = 0;
                sim.lastFpsUpdate = currentTime;
            }

            // CRITICAL: Use fixed step size for stability
            sim.time += SIM_STEP * sim.speed;

            // Update the metaballs - this is the heaviest computation
            updateMetaballs(effect, sim.time, NUM_METABALLS, sim.strength, sim.subtract);
        }
    });

    // Add click handler for navigation
    useEffect(() => {
        const handleClick = () => {
            if (hoveredSection !== null && hoveredSection >= 0) {
                const sectionIndex = hoveredSection % portfolioSections.length;
                navigate(portfolioSections[sectionIndex].path);

                // Add a visual effect for feedback
                const effect = marchingCubesRef.current;
                if (effect) {
                    // Flash effect or ripple when clicking
                    effect.isolation -= 20; // Temporary change to isolation
                    setTimeout(() => {
                        effect.isolation += 20;
                    }, 200);
                }
            }
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [hoveredSection, navigate]);

    // Add overlay component for section labels and cards
    const SectionLabels = () => {
        return (
            <div className="section-labels">
                {hoveredSection !== null && hoveredSection >= 0 && (
                    <div className="section-label"
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '70%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            color: 'white',
                            padding: '10px 20px',
                            borderRadius: '5px',
                            fontWeight: 'bold',
                            zIndex: 100
                        }}>
                        {portfolioSections[hoveredSection % portfolioSections.length].name}
                    </div>
                )}
            </div>
        );
    };

    // Card component for single morphed metaball - better centered display
    const MetaballCard = ({ position, sectionData, progress, index }) => {
        // Only show text content when metaball has significantly morphed into rectangular shape
        if (!sectionData || progress < 0.5) return null;

        // Convert metaball space (0-1) to screen space - centered positioning
        const scaleX = window.innerWidth * 0.6; // Smaller scale for single centered card
        const scaleY = window.innerHeight * 0.6;
        const screenX = (position.x - 0.5) * scaleX;
        const screenY = -(position.y - 0.5) * scaleY;
        
        // Text appears gradually as metaball becomes more rectangular
        const textOpacity = Math.min(1, Math.max(0, (progress - 0.5) / 0.3)); 
        
        // Larger text container for single card display
        const textWidth = Math.min(350, 200 + (progress * 150)); 
        const textHeight = Math.min(400, 150 + (progress * 250)); 

        return (
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) translate(${screenX}px, ${screenY}px)`,
                    width: `${textWidth}px`,
                    height: `${textHeight}px`,
                    padding: '20px',
                    opacity: textOpacity,
                    transition: 'none',
                    pointerEvents: textOpacity > 0.8 ? 'auto' : 'none',
                    cursor: 'pointer',
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                    backgroundColor: 'transparent'
                }}
                onClick={() => navigate(sectionData.path)}
            >
                {/* Title appears when metaball rectangle is well-formed */}
                {progress > 0.6 && (
                    <div style={{
                        color: `rgba(255, 255, 255, ${Math.min(0.95, (progress - 0.6) / 0.2)})`,
                        fontSize: `${18 + progress * 8}px`, // Larger text for single card
                        fontWeight: 'bold',
                        marginBottom: '15px',
                        textAlign: 'center',
                        textShadow: `3px 3px 6px rgba(0,0,0,0.8)`,
                        opacity: Math.min(1, (progress - 0.6) / 0.2),
                        transform: `translateY(${Math.max(0, (1 - progress) * 15)}px)`
                    }}>
                        {sectionData.title}
                    </div>
                )}
                
                {/* Description appears when rectangle is more complete */}
                {progress > 0.75 && (
                    <div style={{
                        color: `rgba(220, 220, 220, ${Math.min(0.85, (progress - 0.75) / 0.15)})`,
                        fontSize: `${12 + progress * 3}px`, // Larger description text
                        lineHeight: '1.5',
                        textAlign: 'center',
                        textShadow: `2px 2px 4px rgba(0,0,0,0.8)`,
                        opacity: Math.min(1, (progress - 0.75) / 0.15),
                        transform: `translateY(${Math.max(0, (1 - progress) * 10)}px)`,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        marginBottom: '15px'
                    }}>
                        {sectionData.description}
                    </div>
                )}

                {/* Items appear when fully rectangular */}
                {progress > 0.85 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        opacity: Math.min(1, (progress - 0.85) / 0.15),
                        transform: `translateY(${Math.max(0, (1 - progress) * 8)}px)`
                    }}>
                        {sectionData.items.map((item, itemIndex) => (
                            <div 
                                key={itemIndex}
                                style={{
                                    color: `rgba(255, 255, 255, ${Math.min(0.8, (progress - 0.85 - itemIndex * 0.02) / 0.05)})`,
                                    fontSize: '12px', // Larger item text
                                    padding: '8px 16px',
                                    backgroundColor: `rgba(255, 255, 255, 0.12)`,
                                    borderRadius: '8px',
                                    textAlign: 'center',
                                    textShadow: `1px 1px 3px rgba(0,0,0,0.6)`,
                                    backdropFilter: 'blur(3px)',
                                    border: '1px solid rgba(255, 255, 255, 0.25)',
                                    opacity: Math.max(0, Math.min(1, (progress - 0.85 - itemIndex * 0.02) / 0.05)),
                                    transform: `translateY(${Math.max(0, (1 - (progress - 0.85 - itemIndex * 0.02)) * 5)}px)`
                                }}
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Cards overlay component
    const CardsOverlay = () => {
        return (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {metaballPositions.current.map((pos, index) => (
                    <MetaballCard
                        key={index}
                        position={pos}
                        sectionData={pos.sectionData}
                        progress={pos.progress}
                        index={index}
                    />
                ))}
            </div>
        );
    };

    // Move your buttons inside the existing Html component
    return (
        <>
            <Stats></Stats>
            <OrbitControls
                enableZoom={false}
                enablePan={true}
                enableRotate={false}
                autoRotate={true}
                autoRotateSpeed={0.5 * (1 - morphingProgress * 0.8)} // Slow down rotation when morphing
                minDistance={25}
                maxDistance={25}
                enableDamping={true}
                dampingFactor={0.05}
            />
            <Environment preset="studio" intensity={0.3} />
            <Html fullscreen>
                <SectionLabels />
                <CardsOverlay />
                
                {/* Scroll Progress Indicator */}
                <div style={{
                    position: 'fixed',
                    right: '30px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '15px',
                    zIndex: 200
                }}>
                    {portfolioSections.map((section, index) => {
                        const isActive = currentSection === index;
                        const progress = currentSection === index ? morphingProgress : (currentSection > index ? 1 : 0);
                        
                        return (
                            <div
                                key={section.id}
                                style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    backgroundColor: isActive 
                                        ? `rgba(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255}, ${0.8 + progress * 0.2})`
                                        : `rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255}, 0.4)`,
                                    border: `2px solid rgba(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255}, 0.6)`,
                                    transition: 'all 0.3s ease',
                                    transform: `scale(${isActive ? 1.2 + progress * 0.3 : 1})`,
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}
                                title={section.name}
                                onClick={() => {
                                    scrollAccumulator.current = index;
                                    setCurrentSection(index);
                                    setMorphingProgress(0);
                                }}
                            >
                                {/* Progress ring for active section */}
                                {isActive && (
                                    <div style={{
                                        position: 'absolute',
                                        inset: '-4px',
                                        borderRadius: '50%',
                                        border: `2px solid rgba(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255}, ${progress * 0.8})`,
                                        transform: `rotate(${progress * 360}deg)`,
                                        borderTopColor: 'transparent',
                                        borderRightColor: progress > 0.25 ? 'transparent' : undefined,
                                        borderBottomColor: progress > 0.5 ? 'transparent' : undefined,
                                        borderLeftColor: progress > 0.75 ? 'transparent' : undefined,
                                    }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Instructions */}
                <div style={{
                    position: 'fixed',
                    bottom: '30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: `rgba(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255}, 0.8)`,
                    fontSize: '16px',
                    textAlign: 'center',
                    fontWeight: '500',
                    zIndex: 100,
                    opacity: morphingProgress < 0.5 ? 1 : 0.3,
                    transition: 'opacity 0.5s ease'
                }}>
                    Scroll to cycle through portfolio sections
                </div>
            </Html>
        </>
    );
};
const BlobNavigation = () => {
    const [hovered, setHovered] = useState(null);

    return (
        <div style={{
            position: 'fixed',
            bottom: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '30px',
            zIndex: 1000,
            pointerEvents: 'auto'
        }}>
            {/* About Me Blob */}
            <div
                onMouseEnter={() => setHovered('about')}
                onMouseLeave={() => setHovered(null)}
                onClick={() => navigate('/about')}
                style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '60% 40% 70% 30% / 50% 60% 40% 50%',
                    background: `rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255}, 0.9)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.5s ease-in-out',
                    transform: hovered === 'about' ? 'scale(1.1)' : 'scale(1)',
                    animation: 'blob-morph 8s ease-in-out infinite',
                    boxShadow: `0 0 15px rgba(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255}, 0.5)`,
                }}
            >
                <span style={{
                    color: `rgb(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255})`,
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    textAlign: 'center',
                    textShadow: `0 0 5px rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255}, 0.5)`,
                }}>
                    About Me
                </span>
            </div>

            {/* Projects Blob */}
            <div
                onMouseEnter={() => setHovered('projects')}
                onMouseLeave={() => setHovered(null)}
                onClick={() => navigate('/projects')}
                style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '40% 60% 30% 70% / 60% 40% 70% 30%',
                    background: `rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255}, 0.9)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.5s ease-in-out',
                    transform: hovered === 'projects' ? 'scale(1.1)' : 'scale(1)',
                    animation: 'blob-morph 8s ease-in-out infinite 2s',
                    boxShadow: `0 0 15px rgba(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255}, 0.5)`,
                }}
            >
                <span style={{
                    color: `rgb(${highlightColor.r * 255}, ${highlightColor.g * 255}, ${highlightColor.b * 255})`,
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    textAlign: 'center',
                    textShadow: `0 0 5px rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255}, 0.5)`,
                }}>
                    Projects
                </span>
            </div>

            {/* Add CSS animation keyframes */}
            <style>
                {`
          @keyframes blob-morph {
            0% {
              border-radius: 60% 40% 70% 30% / 50% 60% 40% 50%;
            }
            25% {
              border-radius: 50% 50% 40% 60% / 40% 60% 60% 40%;
            }
            50% {
              border-radius: 40% 60% 60% 40% / 60% 40% 50% 50%;
            }
            75% {
              border-radius: 60% 40% 50% 50% / 30% 60% 70% 40%;
            }
            100% {
              border-radius: 60% 40% 70% 30% / 50% 60% 40% 50%;
            }
          }
        `}
            </style>
        </div>
    );
};
export default MorphingLavaLamp;