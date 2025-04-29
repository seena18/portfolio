import { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats, Environment, Html } from '@react-three/drei';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import * as THREE from 'three';

// Simulation constants
const CONTAINER_HEIGHT = 16; // Increased from 12
const CONTAINER_RADIUS = 4.5; // Increased from 3
const BUFFER_ZONE = 0.2; // Keep the same buffer zone percentage

// Updated constants for smoother substance with occasional blob ejection
const RESOLUTION = 128;
const NUM_METABALLS = 4; // Increase to have more potential ejections
const NUM_SUPPORT_BALLS = 2; // Reduce for a more unified main blob
const NUM_FREE_PARTICLES = 1;

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

// First, import navigation capabilities
import { useNavigate } from 'react-router-dom';
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
const LavaLampModel = ({ baseColor, highlightColor, backgroundColor, portfolioData, viewport = {
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
  // Add color state variables


  // Define portfolio sections for navigation
  const portfolioSections = [
    { id: 0, name: "Projects", path: "/projects", color: new THREE.Color(0x111111) },
    { id: 1, name: "About", path: "/about", color: new THREE.Color(0x222222) },
    { id: 2, name: "Skills", path: "/skills", color: new THREE.Color(0x333333) },
    { id: 3, name: "Contact", path: "/contact", color: new THREE.Color(0x444444) }
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
    strength: .8, // Increased from 2.0
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
    const sim = simRef.current;

    // Only initialize if needed
    if (sim.initialized) return;

    console.log("Initializing lava lamp with marching cubes");

    // Setup camera at fixed maximum distance
    camera.position.set(0, 0, 25);
    camera.lookAt(0, 0, 0);

    // Setup renderer with transparency support
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    gl.setClearColor(
      new THREE.Color(backgroundColor.r, backgroundColor.g, backgroundColor.b),
      1.0
    );
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;

    // Create material with the custom shaders and color uniforms
    const lavaMaterial = createLavaLampMaterial(baseColor, highlightColor);

    // Create marching cubes instance
    const effect = new MarchingCubes(
      RESOLUTION,
      lavaMaterial,
      false,
      false,
      100000
    );

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

    // Start simulation
    sim.clock.start();
    sim.initialized = true;

    // Run initial update
    updateMetaballs(
      effect,
      sim.time,
      NUM_METABALLS,
      sim.strength,
      sim.subtract
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

  // Process metaballs for marching cubes - OPTIMIZED
  const updateMetaballs = (effect, time, numMetaballs, strength, subtract) => {
    // Reset without conditional checks
    effect.reset();

    // Add new non-spherical warping frequencies
    const warpFreqX = time * 0.47;
    const warpFreqY = time * 0.39;
    const warpFreqZ = time * 0.53;

    // Asymmetric warping values for all metaballs
    const globalWarpX = ASYMMETRY_FACTOR * Math.sin(warpFreqX);
    const globalWarpY = ASYMMETRY_FACTOR * Math.sin(warpFreqY);
    const globalWarpZ = ASYMMETRY_FACTOR * Math.sin(warpFreqZ);

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

    // Central blob - INCREASED strength to hold satellites better
    effect.addBall(finalCenterX, finalCenterY, finalCenterZ, strength * 1.7, subtract); // Increased from 1.4

    // Supporting metaballs - REDUCED COUNT
    for (let i = 0; i < NUM_SUPPORT_BALLS; i++) {
      const angle = i * 2.1 + time * 0.1;

      // Individual jiggling for each support ball
      const supportJiggleX = jiggleX * (1 + 0.5 * Math.sin(i * 2.1));
      const supportJiggleY = jiggleY * (1 + 0.5 * Math.cos(i * 1.7));
      const supportJiggleZ = jiggleZ * (1 + 0.5 * Math.sin(i * 1.3));

      // Create internal warp patterns unique to each support ball
      const internalWarpPhase = time * 1.2 + i * 2.1;
      const internalWarpX = INTERNAL_WARP_STRENGTH * Math.sin(internalWarpPhase * 1.1) * Math.cos(internalWarpPhase * 0.7);
      const internalWarpY = INTERNAL_WARP_STRENGTH * Math.sin(internalWarpPhase * 0.9) * Math.cos(internalWarpPhase * 1.3);
      const internalWarpZ = INTERNAL_WARP_STRENGTH * Math.sin(internalWarpPhase * 1.3) * Math.cos(internalWarpPhase * 0.5);

      const orbitRadius = 0.12;
      const px = centerX + Math.cos(angle) * orbitRadius * xElongation + supportJiggleX;
      const py = centerY + Math.sin(angle) * orbitRadius * yElongation + supportJiggleY;
      const pz = centerZ + Math.sin(angle * 0.7) * orbitRadius * zElongation + supportJiggleZ;

      // Add the main metaball
      effect.addBall(px, py, pz, strength * 0.8, subtract);

      // Add 2-3 smaller neighboring balls to create non-spherical shapes
      // These create elongated "lobes" that make the metaball look stretched
      effect.addBall(
        px + internalWarpX * 0.07,
        py + internalWarpY * 0.05,
        pz + internalWarpZ * 0.06,
        strength * 0.5,
        subtract
      );

      effect.addBall(
        px - internalWarpX * 0.08,
        py - internalWarpY * 0.06,
        pz - internalWarpZ * 0.05,
        strength * 0.45,
        subtract
      );
    }

    // Satellite metaballs - REDUCED COUNT and SIMPLIFIED MATH
    for (let i = 0; i < numMetaballs; i++) {
      // Use a slower lifecycle timing to reduce frequency of separation events
      const lifecycleBase = (time * 0.05 + i * 0.9) % 4; // Reduced from 0.07 to slow down cycles
      let radius, ballStrength;

      // Create lifecycle phases with reduced separation time
      if (lifecycleBase < 1.5) { // Shortened connected phase
        // Phase 1: connected to main blob
        radius = 0.1 + (lifecycleBase * 0.1); // Slower expansion
        ballStrength = strength * (1.0 - lifecycleBase * 0.2); // Stronger initial connection
      }
      else if (lifecycleBase < 2.1) { // Extended separation phase
        // Phase 2: rapid ejection
        const ejectionProgress = (lifecycleBase - 1.5) / 0.6;
        radius = 0.25 + ejectionProgress * 0.15; // Increase distance more dramatically
        ballStrength = strength * (0.7 - ejectionProgress * 0.5); // Sharp decrease in connection strength
      }
      else if (lifecycleBase < 3.0) { // Extended independent phase
        // Phase 3: fully separated
        radius = 0.4; // Further away
        ballStrength = strength * 0.2; // Very weak connection to main blob
      }
      else {
        // Phase 4: return to main blob
        const fallProgress = (lifecycleBase - 3.0) / 1.0;
        radius = 0.4 - fallProgress * 0.3;
        ballStrength = strength * (0.2 + fallProgress * 0.8); // Rapidly increasing strength as it returns
      }

      // Use modulo once instead of multiple times
      const ballType = i % 3;

      // Optimize angle calculations - precalculate
      const thetaAngle = i * 1.05 + time * 0.2;
      const phiAngle = i * 0.8 + time * 0.15;

      // Simplified sine/cosine calculations - reuse values
      const sinTheta = Math.sin(thetaAngle);
      const cosTheta = Math.cos(thetaAngle);
      const sinPhi = Math.sin(phiAngle);
      const cosPhi = Math.cos(phiAngle);

      // Optimize direction calculations based on type
      let dirX, dirY, dirZ;

      if (ballType === 0) {
        // Add high-frequency jiggling to X-direction balls
        const ballJiggleX = jiggleX * 1.5 * (1 + 0.5 * Math.sin(i * 2.7 + time));
        const ballJiggleY = jiggleY * 1.2 * (1 + 0.5 * Math.cos(i * 1.9 + time));
        const ballJiggleZ = jiggleZ * 1.2 * (1 + 0.5 * Math.sin(i * 2.3 + time));

        dirX = sinTheta * cosPhi * radius * xElongation * 1.6 + xUndulation + ballJiggleX; // INCREASED from 1.4
        dirY = sinPhi * radius * 0.9 + yUndulation * 0.3 + ballJiggleY; // REDUCED y-factor to 0.9
        dirZ = cosTheta * cosPhi * radius + zUndulation * 0.3 + ballJiggleZ;
      }
      else if (ballType === 1) {
        // Add high-frequency jiggling to Y-direction balls
        const ballJiggleX = jiggleX * 1.2 * (1 + 0.5 * Math.sin(i * 2.1 + time));
        const ballJiggleY = jiggleY * 1.5 * (1 + 0.5 * Math.cos(i * 2.5 + time));
        const ballJiggleZ = jiggleZ * 1.2 * (1 + 0.5 * Math.sin(i * 1.7 + time));

        dirX = sinTheta * cosPhi * radius + xUndulation * 0.3 + ballJiggleX;
        dirY = sinPhi * radius * yElongation * 1.1 + yUndulation + ballJiggleY; // REDUCED from 1.4
        dirZ = cosTheta * cosPhi * radius + zUndulation * 0.3 + ballJiggleZ;
      }
      else {
        // Add high-frequency jiggling to Z-direction balls
        const ballJiggleX = jiggleX * 1.2 * (1 + 0.5 * Math.sin(i * 1.5 + time));
        const ballJiggleY = jiggleY * 1.2 * (1 + 0.5 * Math.cos(i * 2.3 + time));
        const ballJiggleZ = jiggleZ * 1.5 * (1 + 0.5 * Math.sin(i * 2.9 + time));

        dirX = sinTheta * cosPhi * radius + xUndulation * 0.3 + ballJiggleX;
        dirY = sinPhi * radius + yUndulation * 0.3 + ballJiggleY;
        dirZ = cosTheta * cosPhi * radius * zElongation * 1.6 + zUndulation + ballJiggleZ; // INCREASED from 1.4
      }

      // Calculate position
      const ballx = centerX + dirX;
      const bally = centerY + dirY;
      const ballz = centerZ + dirZ;

      // Simplified safety bounds check using min/max
      const safeBallx = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, ballx));
      const safeBally = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, bally));
      const safeBallz = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, ballz));

      // Create non-spherical field by using multiple overlapping balls
      // Main ball
      effect.addBall(safeBallx, safeBally, safeBallz, ballStrength, subtract);

      // Create a more complex stretched shape with multiple offset balls
      const stretchFactor = 0.18; // Increased from 0.12
      const stretchDir = Math.sin(time * 1.7 + i * 2.3);

      // Calculate main stretch direction based on movement
      const stretchX = stretchFactor * (dirX - prevDirX[i]) * ELONGATION_FACTOR * stretchDir;
      const stretchY = stretchFactor * (dirY - prevDirY[i]) * ELONGATION_FACTOR * stretchDir;
      const stretchZ = stretchFactor * (dirZ - prevDirZ[i]) * ELONGATION_FACTOR * stretchDir;

      // Store current position for next frame's velocity calculation
      prevDirX[i] = dirX;
      prevDirY[i] = dirY;
      prevDirZ[i] = dirZ;

      // Create a string of metaballs in the direction of movement
      for (let s = 1; s <= SHAPE_COMPLEXITY; s++) {
        const t = s / SHAPE_COMPLEXITY;
        const offset = Math.pow(t, 1.2); // Non-linear spacing

        // Calculate position with some randomness for less uniformity
        const wobbleX = DISTORTION_AMOUNT * Math.sin(time * 2.7 + i + s * 1.3);
        const wobbleY = DISTORTION_AMOUNT * Math.sin(time * 3.1 + i + s * 1.7);
        const wobbleZ = DISTORTION_AMOUNT * Math.sin(time * 2.3 + i + s * 1.1);

        // Add ball in stretch direction
        effect.addBall(
          Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, safeBallx + stretchX * offset + wobbleX)),
          Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, safeBally + stretchY * offset + wobbleY)),
          Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, safeBallz + stretchZ * offset + wobbleZ)),
          ballStrength * (0.7 - 0.4 * offset), // Gradually weaker
          subtract
        );

        // Add a small perpendicular bulge for more irregular shapes
        if (s < SHAPE_COMPLEXITY - 1) {
          const perpX = stretchZ * 0.4 * Math.sin(time + i + s);
          const perpY = stretchX * 0.4 * Math.sin(time * 1.2 + i + s);
          const perpZ = stretchY * 0.4 * Math.sin(time * 0.8 + i + s);

          effect.addBall(
            Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, safeBallx + stretchX * offset + perpX)),
            Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, safeBally + stretchY * offset + perpY)),
            Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, safeBallz + stretchZ * offset + perpZ)),
            ballStrength * 0.4,
            subtract
          );
        }
      }
    }

    // Free particles - REDUCED COUNT and SIMPLIFIED MATH
    for (let i = 0; i < NUM_FREE_PARTICLES; i++) {
      const freeTheta = time * 0.3 + i * 2.1;
      const freePhi = time * 0.2 + i * 1.57;

      // Add erratic, high-frequency jiggling to free particles
      const freeJiggleX = jiggleX * 2.5 * (1 + Math.sin(time * 4.1 + i * 3.7));
      const freeJiggleY = jiggleY * 2.5 * (1 + Math.cos(time * 3.9 + i * 2.8));
      const freeJiggleZ = jiggleZ * 2.5 * (1 + Math.sin(time * 4.5 + i * 3.2));

      const freeRadius = 0.18;

      const sinTheta = Math.sin(freeTheta);
      const cosTheta = Math.cos(freeTheta);
      const sinPhi = Math.sin(freePhi);
      const cosPhi = Math.cos(freePhi);

      let fx, fy, fz;

      // Adjust free particles to be less vertical:
      if (i === 0) {
        fx = centerX + sinTheta * cosPhi * freeRadius * xElongation * 2.0 + xUndulation + freeJiggleX; // INCREASED from 1.7
        fy = centerY + sinPhi * freeRadius * 0.9 + yUndulation + freeJiggleY; // REDUCED by adding 0.9 factor
        fz = centerZ + cosTheta * cosPhi * freeRadius + zUndulation + freeJiggleZ;
      } else {
        fx = centerX + sinTheta * cosPhi * freeRadius + xUndulation + freeJiggleX;
        fy = centerY + sinPhi * freeRadius * yElongation * 1.4 + yUndulation + freeJiggleY; // REDUCED from 1.7
        fz = centerZ + cosTheta * cosPhi * freeRadius * zElongation * 1.8 + zUndulation + freeJiggleZ; // INCREASED from nothing
      }

      // Use BUFFER_ZONE to avoid edge clipping
      const safeFx = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, fx));
      const safeFy = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, fy));
      const safeFz = Math.max(BUFFER_ZONE, Math.min(1 - BUFFER_ZONE, fz));

      // Middle ground for free particle strength
      effect.addBall(safeFx, safeFy, safeFz, strength * 0.4, subtract); // Reduced from 0.5
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

  // Animation with useFrame
  useFrame((state, delta) => {
    const sim = simRef.current;
    if (!sim.initialized) return;

    // CRITICAL: Skip all animation when freezing for restore
    if (sim.freezeAnimation) {
      return;
    }

    // Update 3D mouse position using raycasting
    if (mousePos.current) {
      raycaster.current.setFromCamera(mousePos.current, camera);

      // Create a plane at z=0 to intersect with
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersectPoint = new THREE.Vector3();

      raycaster.current.ray.intersectPlane(plane, intersectPoint);

      // Scale to fit in our scene
      intersectPoint.divideScalar(10);
      mouse3D.current = intersectPoint;
    }

    // Calculate time with frame-rate independence
    const currentTime = sim.clock.getElapsedTime();

    // PERFORMANCE: Update FPS counter only occasionally
    sim.frameCount++;
    if (currentTime - sim.lastFpsUpdate > 0.5) { // Update every half second
      setStats({
        fps: Math.round(sim.frameCount / (currentTime - sim.lastFpsUpdate))
      });
      sim.frameCount = 0;
      sim.lastFpsUpdate = currentTime;
    }

    // CRITICAL PERFORMANCE: Skip frames when needed to maintain performance
    // Only process every other frame when performance is suffering
    if (stats.fps < 20 && sim.frameCount % 2 !== 0) {
      return; // Skip this frame
    }

    // Calculate delta time with clamping to avoid spikes
    const deltaTime = Math.min(0.1, currentTime - sim.lastTime);
    sim.lastTime = currentTime;

    // Use fixed-timestep updates for more stability
    sim.time += deltaTime * sim.speed;

    // Simplified temperature calculation
    sim.baseTemp = 0.5 + 0.3 * Math.sin(currentTime * 0.1);

    // Update marching cubes metaballs
    const effect = marchingCubesRef.current;
    if (effect) {
      // Add a high-frequency jiggling component to the overall position
      const jiggleAmplitude = 0.05 * JIGGLE_INTENSITY;
      const jiggleSpeed = 5.0;

      const jitterX = jiggleAmplitude * Math.sin(currentTime * jiggleSpeed * 1.1);
      const jitterY = jiggleAmplitude * Math.sin(currentTime * jiggleSpeed * 0.9);
      const jitterZ = jiggleAmplitude * Math.sin(currentTime * jiggleSpeed * 1.3);

      // Combine smooth movement with high-frequency jitter
      const targetX = Math.sin(currentTime * 0.2) * 0.5 + jitterX; // INCREASED from 0.4
      const targetY = Math.sin(currentTime * 0.1) * 0.25 + jitterY; // REDUCED from 0.3
      const targetZ = Math.sin(currentTime * 0.17) * 0.45 + jitterZ; // INCREASED from 0.3

      const damping = 0.1;
      effect.position.x += (targetX - effect.position.x) * damping;
      effect.position.y += (targetY - effect.position.y) * damping;
      effect.position.z += (targetZ - effect.position.z) * damping;

      // Add additional safety check to prevent boundary crossing
      effect.position.x = Math.max(-0.4, Math.min(0.4, effect.position.x));
      effect.position.y = Math.max(-0.3, Math.min(0.3, effect.position.y));
      effect.position.z = Math.max(-0.3, Math.min(0.3, effect.position.z));

      // Simpler rotation update
      effect.rotation.y += (Math.sin(currentTime * 0.15) * 0.15 - effect.rotation.y) * damping;

      // Simplified isolation adjustment
      effect.isolation = ISOLATION - (sim.baseTemp - 0.5) * 20;

      // Update metaballs
      updateMetaballs(
        effect,
        sim.time,
        NUM_METABALLS,
        sim.strength,
        sim.subtract
      );
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

  // Add overlay component for section labels
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

  // Move your buttons inside the existing Html component
  return (
    <>
      <Stats />
      <OrbitControls
        enableZoom={false}
        enablePan={true}
        enableRotate={false}
        autoRotate={true}
        autoRotateSpeed={0.5}
        minDistance={25}
        maxDistance={25}
        enableDamping={true}
        dampingFactor={0.05}
      />
      <Environment preset="studio" intensity={0.3} />
      <Html fullscreen>
        <SectionLabels />

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
export default LavaLampModel;