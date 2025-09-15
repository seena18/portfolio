import { useRef, useEffect, useState, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import './Scene.css';

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

// Updated constants for smoother substance with occasional blob ejection
const RESOLUTION = 120; // Reduced from 128 for better performance
const NUM_METABALLS = 1; // Increased from 1 to create multiple separate blobs instead of one giant central blob
const NUM_SUPPORT_BALLS = 1; // Reduced from 2
const NUM_FREE_PARTICLES = 0; // Removed free particles entirely

// Reduce isolation for less cohesive, more fluid blobs
const ISOLATION = 100; // Further reduced from 80 to prevent giant central blob formation

// Reduce asymmetry for more cohesive main blob
const ASYMMETRY_FACTOR = 1; // Reduced from 3
const INTERNAL_WARP_STRENGTH = 1.5; // Further reduced to promote separation

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
const LavaLampModel = ({ baseColor, highlightColor, backgroundColor, portfolioData, viewport = {
  width: window.innerWidth,
  height: window.innerHeight,
  aspectRatio: window.innerWidth / window.innerHeight
} }) => {
  // Calculate responsive scaling based on screen size
  const getResponsiveScale = useCallback(() => {
    const baseWidth = 1920; // Reference desktop width
    const baseHeight = 1080; // Reference desktop height
    const currentWidth = window.innerWidth;
    const currentHeight = window.innerHeight;

    // Scale based on the smaller dimension to ensure it fits
    const widthScale = currentWidth / baseWidth;
    const heightScale = currentHeight / baseHeight;
    const scale = Math.min(widthScale, heightScale);

    // Much less aggressive scaling - keep things visible
    let adjustedScale = scale;
    if (currentWidth < 768) {
      // Mobile: only slightly smaller, maintain visibility
      adjustedScale = Math.max(0.8, scale * 1.2); // Ensure minimum 80% scale
    } else if (currentWidth < 1200) {
      // Tablet: minimal adjustment
      adjustedScale = Math.max(0.9, scale * 1.1);
    }

    // More reasonable bounds - never too small
    return Math.max(0.6, Math.min(2.0, adjustedScale));
  }, []);

  const [responsiveScale, setResponsiveScale] = useState(getResponsiveScale);

  // Update scale when viewport changes
  useEffect(() => {
    const handleResize = () => {
      setResponsiveScale(getResponsiveScale());
    };

    // Set initial scale
    setResponsiveScale(getResponsiveScale());

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getResponsiveScale]);
  // Add state for adjustable parameters with localStorage support
  const getInitialParams = () => {
    try {
      const saved = localStorage.getItem('lavaLampParams');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate the saved parameters to ensure they're within expected ranges
        return {
          numMetaballs: Math.max(1, Math.min(15, parsed.numMetaballs || 1)),
          isolation: Math.max(10, Math.min(300, parsed.isolation || 300)),
          strength: Math.max(0.1, Math.min(10, parsed.strength || 4.2)),
          internalWarpStrength: Math.max(0.1, Math.min(10, parsed.internalWarpStrength || 0.1)),
          asymmetryFactor: Math.max(0.1, Math.min(20, parsed.asymmetryFactor || 20)),
          jiggleIntensity: Math.max(0, Math.min(5, parsed.jiggleIntensity || 0)),
          maxDistance: Math.max(0.1, Math.min(2, parsed.maxDistance || 0.35)),
          speed: Math.max(0.01, Math.min(2, parsed.speed || 1.02))
        };
      }
    } catch (error) {
      console.warn('Failed to load saved lava lamp parameters:', error);
    }
    // Default values
    return {
      numMetaballs: 1,
      isolation: 300,
      strength: 4.2,
      internalWarpStrength: 0.1,
      asymmetryFactor: 20,
      jiggleIntensity: 0,
      maxDistance: 0.35,
      speed: 1.02
    };
  };

  const [adjustableParams, setAdjustableParams] = useState(getInitialParams);

  // Save parameters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('lavaLampParams', JSON.stringify(adjustableParams));
    } catch (error) {
      console.warn('Failed to save lava lamp parameters:', error);
    }
  }, [adjustableParams]);

  // Add easing functions for smoother transitions
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
  const easeInQuad = (t) => t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3); // ADD THIS for slower convergence end

  // Fixed color conversion functions - MOVE THESE HERE, BEFORE THEIR USAGE
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

  // Add navigation hook
  const navigate = useNavigate();
  const mouseTrail = useRef([]);
  const mouseVelocity = useRef(new THREE.Vector2(0, 0));
  const prevMousePos = useRef(new THREE.Vector2(0, 0));
  const isDragging = useRef(false);

  // FIX: baseColor and highlightColor are already RGB objects, not hex strings
  // Remove the hexToRgb conversion
  const [color1, setColor1] = useState(baseColor);
  const [color2, setColor2] = useState(highlightColor);

  // Add these refs for smooth interpolation - ADD THESE LINES after line 157
  const lastUpdateTime = useRef(0);
  const rectangleStateRef = useRef({
    centerX: 0.5,
    centerY: 0.5,
    centerZ: 0.5,
    width: 0,
    height: 0,
    depth: 0
  });
  const targetRectangleStateRef = useRef({
    centerX: 0.5,
    centerY: 0.5,
    centerZ: 0.5,
    width: 0,
    height: 0,
    depth: 0
  });

  // (Duplicate refs removed to fix redeclaration errors)

  // Define portfolio sections for navigation and card content
  const portfolioSections = [
    {
      id: 0,
      name: "Projects",
      path: "/projects",
      color: new THREE.Color(0x111111),
      title: "Featured Projects",
      description: "Explore my latest work including web apps, 3D experiences, and creative coding.",
      items: ["React Three Fiber Portfolio", "E‑commerce Platform", "3D Data Visualization"],
    },
    {
      id: 1,
      name: "About",
      path: "/about",
      color: new THREE.Color(0x222222),
      title: "About Me",
      description: "Full‑stack developer crafting immersive digital experiences and tooling.",
      items: ["5+ Years Experience", "React/Three.js Specialist", "UI/UX minded"],
    },
    {
      id: 2,
      name: "Skills",
      path: "/skills",
      color: new THREE.Color(0x333333),
      title: "Technical Skills",
      description: "Proficient across modern web, 3D graphics, and creative development stacks.",
      items: ["JavaScript/TypeScript", "React/Next.js", "Three.js/WebGL"],
    },
    {
      id: 3,
      name: "Sandbox",
      path: "/sandbox",
      color: new THREE.Color(0x9966ff),
      title: "Sandbox Mode",
      description: "Experiment with lava lamp parameters and color themes.",
      items: ["Lava Lamp Controls", "Color Themes", "Real-time Preview"],
    },
    {
      id: 4,
      name: "Contact",
      path: "/contact",
      color: new THREE.Color(0x444444),
      title: "Let’s talk",
      description: "Open to collaborations, roles, and interesting challenges.",
      items: ["Email", "GitHub", "LinkedIn"],
    },
  ];

  // Add state for hover feedback
  const [hoveredSection, setHoveredSection] = useState(null);
  const blobPositions = useRef(Array(NUM_METABALLS).fill(new THREE.Vector3()));
  const blobStrengths = useRef(Array(NUM_METABALLS).fill(0));

  const { camera, gl, scene } = useThree();
  const [stats, setStats] = useState({ fps: 0 });

  // Scroll/morph state
  const [scrollProgress, setScrollProgress] = useState(0);
  const [morphingProgress, setMorphingProgress] = useState(0); // 0: fluid, 1: card stage
  const [currentSection, setCurrentSection] = useState(0);
  const scrollAccumulator = useRef(0);
  const morphRef = useRef(0);
  useEffect(() => { morphRef.current = morphingProgress; }, [morphingProgress]);

  // Morph phase state machine: 'lava' -> 'toRect' -> 'rect' -> 'toLava'
  const [phase, setPhase] = useState('lava');
  const phaseRef = useRef('lava');
  const setPhaseBoth = (p) => { phaseRef.current = p; setPhase(p); };
  const [menuHidden, setMenuHidden] = useState(false); // Track immediate menu hiding
  const [menuClicked, setMenuClicked] = useState(false); // Track when menu item is clicked for transition
  const [menuFadeProgress, setMenuFadeProgress] = useState(0); // Smooth fade progress for sandbox mode
  const [sandboxMode, setSandboxMode] = useState(false); // Track sandbox mode for controls visibility
  const queuedSectionRef = useRef(null); // stores next section index while transitioning
  const targetSectionRef = useRef(currentSection); // section the rectangle should represent on next toRect
  // Rectangle spawn offset so it appears to grow from a nearby metaball
  const rectSpawnRef = useRef(new THREE.Vector3(0.5, 0.5, 0.5));
  // Live center of the main lava blob; used to pick a source blob for rectangle morph
  const centerRef = useRef(new THREE.Vector3(0.5, 0.5, 0.5));
  // Wheel quantization: prevent multiple triggers until stable
  const wheelLockedRef = useRef(false);
  const lastWheelActionRef = useRef(0);
  // Performance/quality management
  const perfRef = useRef({ quality: 1.0 }); // 0.5..1.0
  const rectSkipRef = useRef(0); // used to skip heavy updates in stable rect

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
  const baseScale = CONTAINER_RADIUS * 2.2;

  // Update the simRef to include random initial time but keep all other settings intact
  const simRef = useRef({
    initialized: false,
    clock: new THREE.Clock(),
    lastTime: 0,
    time: Math.random() * 100,
    speed: 0.15, // Will be overridden by adjustableParams.speed
    strength: 1.5, // Will be overridden by adjustableParams.strength
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

  // Animate menu fade progress for smooth transitions - simplified
  useEffect(() => {
    if (!menuClicked) {
      setMenuFadeProgress(0);
      return;
    }

    // Faster animation for less stuttering
    const duration = 400; // Reduced from 600ms
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      setMenuFadeProgress(progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [menuClicked]);

  // In the initialization effect, improve the restoration logic
  useEffect(() => {
    // Only load MarchingCubes when needed
    if (!marchingCubesRef.current) {
      import('three/examples/jsm/objects/MarchingCubes.js').then(module => {
        const { MarchingCubes } = module;
        console.log("Initializing lava lamp with marching cubes");

        // Setup camera for side-by-side layout - position lava lamp to the left of center
        const baseCameraDistance = 25;
        const cameraDistance = Math.max(18, Math.min(35, baseCameraDistance * (1 / Math.sqrt(responsiveScale))));

        // Position camera to view lava lamp on the left side of screen
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth < 1200;

        if (isMobile) {
          // Mobile: center the lava lamp, menu below
          camera.position.set(0, 0, cameraDistance);
          camera.lookAt(0, 0, 0);
        } else {
          // Desktop/Tablet: position camera to center the blob+menu "container"
          camera.position.set(5, 0, cameraDistance);  // Moved slightly toward center
          camera.lookAt(5, 0, 0);  // Look at offset position
        }
        camera.updateProjectionMatrix();  // Ensure camera updates

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
        const lavaMaterial = createLavaLampMaterial(baseColor, highlightColor);

        // Create marching cubes instance with responsive resolution and scale
        const screenArea = window.innerWidth * window.innerHeight;
        const baseArea = 1920 * 1080; // Reference screen area
        const resolutionScale = Math.sqrt(screenArea / baseArea);

        // Adjust resolution based on screen size and device capabilities
        let initialResolution;
        if (window.innerWidth < 768) {
          // Mobile devices - improved resolution for better quality
          initialResolution = Math.max(50, Math.min(80, 60 * resolutionScale));
        } else if (window.innerWidth < 1200) {
          // Tablets - higher resolution
          initialResolution = Math.max(70, Math.min(100, 80 * resolutionScale));
        } else {
          // Desktop
          initialResolution = Math.max(80, Math.min(120, 100 * resolutionScale));
        }

        const effect = new MarchingCubes(
          Math.round(initialResolution),
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

        // Set responsive scale based on screen size
        const baseContainerSize = CONTAINER_RADIUS * 2.2;
        const scaledSize = baseContainerSize * responsiveScale;

        effect.scale.set(scaledSize, scaledSize, scaledSize);

        effect.enableUvs = false;
        effect.enableColors = false;
        effect.isolation = adjustableParams.isolation;

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
          adjustableParams.numMetaballs,
          adjustableParams.strength,
          simRef.current.subtract,
          0,
          adjustableParams
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

  // Update marching cubes scale when responsive scale changes
  useEffect(() => {
    if (marchingCubesRef.current) {
      const baseContainerSize = CONTAINER_RADIUS * 2.2;
      const scaledSize = baseContainerSize * responsiveScale;
      marchingCubesRef.current.scale.set(scaledSize, scaledSize, scaledSize);

      // Update camera distance and position for side-by-side layout
      if (camera) {
        const baseCameraDistance = 25;
        const cameraDistance = Math.max(15, Math.min(40, baseCameraDistance * (1 / Math.sqrt(responsiveScale))));

        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth < 1200;

        if (isMobile) {
          // Mobile: center the lava lamp
          camera.position.set(0, 0, cameraDistance);
          camera.lookAt(0, 0, 0);
        } else {
          // Desktop/Tablet: position camera to center the blob+menu "container"
          camera.position.set(5, 0, cameraDistance);  // Moved slightly toward center
          camera.lookAt(5, 0, 0);
        }
        camera.updateProjectionMatrix();
      }
    }
  }, [responsiveScale, camera]);

  // Add centering progress REF for sandbox mode (avoid state updates in useFrame)
  const centeringProgressRef = useRef(0);
  const centeringEnabledRef = useRef(false); // New flag to control when centering actually starts
  const startingPositionsRef = useRef({ center: null, satellites: [] }); // Store starting positions

  // Camera positioning effect for sandbox mode - DELAYED to prevent menu jump
  useEffect(() => {
    if (!camera) return;

    if (sandboxMode && currentSection === 3) {
      console.log('Sandbox useEffect triggered - starting centering animation delay');
      // Delay centering animation to prevent jump - longer delay for smoother transition
      setTimeout(() => {
        console.log('Sandbox: About to enable centering animation - centeringProgressRef is:', centeringProgressRef.current);
        console.log('Sandbox: Current state - sandboxMode:', sandboxMode, 'currentSection:', currentSection);
        centeringEnabledRef.current = true;
        centeringProgressRef.current = 0.001;
        // Reset starting positions so they get captured fresh
        startingPositionsRef.current = { center: null, satellites: [] };
        console.log('Sandbox: Starting centering animation after delay - enabled:', centeringEnabledRef.current, 'progress:', centeringProgressRef.current);
      }, 500); // Increased delay from 100ms to 500ms for smoother transition

    } else if (!sandboxMode) {
      // Reset centering when leaving sandbox
      console.log('Sandbox: Resetting centering progress');
      centeringProgressRef.current = 0;
      centeringEnabledRef.current = false;
      startingPositionsRef.current = { center: null, satellites: [] };
    }
  }, [sandboxMode, currentSection]);

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

  // Track which satellite blob is currently expanded into rectangle
  const expandedBlobRef = useRef(-1); // -1 means none, 0-N means that satellite index
  const satellitePositionsRef = useRef([]); // track live positions of all satellites
  const chosenBlobPosRef = useRef(new THREE.Vector3()); // Store the actual position of chosen blob

  // SIMPLIFIED: Just track blob positions for smooth transitions
  const blobTargetPositions = useRef([]); // Where each blob should go
  const blobCurrentPositions = useRef([]); // Where each blob currently is

  // ADD THIS REF - it was missing
  const hasCompletedFirstCycle = useRef(false); // Track if we've completed at least one morph cycle

  // Process metaballs for marching cubes - SMOOTHER CONVERGENCE
  const updateMetaballs = (effect, time, numMetaballs, strength, subtract, morph = 0, params = adjustableParams) => {
    // Reset without conditional checks
    effect.reset();

    // Use eased morph for smoother visual transitions
    const easedMorph = easeInOutCubic(morph);

    // Scale down organic dynamics as we morph
    const dyn = Math.max(0.3, 1.0 - easedMorph * 0.7);

    // Add new non-spherical warping frequencies
    const warpFreqX = time * 0.47;
    const warpFreqY = time * 0.39;
    const warpFreqZ = time * 0.53;

    // Asymmetric warping values - reduce as morphing increases
    const morphDamping = 1.0 - easedMorph * 0.8;
    const globalWarpX = params.asymmetryFactor * Math.sin(warpFreqX) * morphDamping;
    const globalWarpY = params.asymmetryFactor * Math.sin(warpFreqY) * morphDamping;
    const globalWarpZ = params.asymmetryFactor * Math.sin(warpFreqZ) * morphDamping;

    // Cache expensive calculations and minimize math operations
    const baseTemp = simRef.current.baseTemp;
    const temp = baseTemp + 0.3 * Math.sin(time * simRef.current.cycleSpeed);

    // Modify these elongation factors - reduce during morph
    const timeX = time * 0.13;
    const timeY = time * 0.12;
    const timeZ = time * 0.15;

    // Balance the elongation between axes
    const xElongation = (1.0 + 0.8 * Math.sin(timeX)) * morphDamping + (1 - morphDamping);
    const yElongation = (1.0 + 0.5 * Math.sin(timeY)) * morphDamping + (1 - morphDamping);
    const zElongation = (1.0 + 0.8 * Math.sin(timeZ)) * morphDamping + (1 - morphDamping);

    // Reduce undulation amounts during morph
    const calm = 1.0 - easedMorph;
    const xUndulation = 0.25 * calm * Math.sin(time * 0.27) * Math.sin(time * 0.1);
    const yUndulation = 0.25 * calm * Math.sin(time * 0.31 + 0.5) * Math.sin(time * 0.07);
    const zUndulation = 0.25 * calm * Math.sin(time * 0.23 + 0.9) * Math.sin(time * 0.13);

    // Fixed center values
    const centerX = 0.5;
    const centerY = 0.5;
    const centerZ = 0.5;

    // High-frequency, low-amplitude jiggling offsets - reduce during morph
    const jIntensity = params.jiggleIntensity * calm;
    const jiggleX = 0.03 * jIntensity * Math.sin(time * 2.7) * Math.sin(time * 2.2);
    const jiggleY = 0.03 * jIntensity * Math.sin(time * 3.2) * Math.sin(time * 2.3);
    const jiggleZ = 0.03 * jIntensity * Math.sin(time * 2.3) * Math.sin(time * 2.1);

    // SMOOTHER CENTER BLOB - lerps to center during morph
    const centerUndulationX = xUndulation * 0.3;
    const centerUndulationY = yUndulation * 0.3;
    const centerUndulationZ = zUndulation * 0.3;

    const dynamicCenterX = centerX + centerUndulationX + jiggleX * 0.5;
    const dynamicCenterY = centerY + centerUndulationY + jiggleY * 0.5;
    const dynamicCenterZ = centerZ + centerUndulationZ + jiggleZ * 0.5;

    // Lerp center blob to exact center during morph - delay start to prevent jump
    const centeringStart = 0.1; // Don't start centering until 10% morph progress
    const adjustedMorph = Math.max(0, (easedMorph - centeringStart) / (1 - centeringStart));
    let finalCenterX = THREE.MathUtils.lerp(dynamicCenterX, 0.5, adjustedMorph);
    const finalCenterY = THREE.MathUtils.lerp(dynamicCenterY, 0.5, adjustedMorph);
    const finalCenterZ = THREE.MathUtils.lerp(dynamicCenterZ, 0.5, adjustedMorph);

    // SANDBOX MODE: Camera handles centering, keep blob in original position
    if (sandboxMode && currentSection === 3 && centeringProgressRef.current > 0) {
      console.log(`Sandbox: Keeping center blob at original position - camera will center the view instead`);
    }

    centerRef.current.set(finalCenterX, finalCenterY, finalCenterZ);

    // Debug: Log the actual center position being applied
    if (sandboxMode && currentSection === 3) {
      console.log(`Sandbox: Applied center position - X: ${finalCenterX.toFixed(4)}, Y: ${finalCenterY.toFixed(4)}, Z: ${finalCenterZ.toFixed(4)}`);
    }

    // Adjust center blob strength during morph
    const centerStrength = strength * (1.7 + easedMorph * 2.0); // Grows stronger

    // Debug: Log the center blob being added to the effect
    if (sandboxMode && currentSection === 3) {
      console.log(`Sandbox: Adding center ball to effect - X: ${finalCenterX.toFixed(4)}, Y: ${finalCenterY.toFixed(4)}, Z: ${finalCenterZ.toFixed(4)}, strength: ${(centerStrength * dyn).toFixed(2)}`);
    }

    effect.addBall(finalCenterX, finalCenterY, finalCenterZ, centerStrength * dyn, subtract);

    // SMOOTHER SUPPORT BLOBS - merge into center during morph
    const supportCount = NUM_SUPPORT_BALLS;
    for (let i = 0; i < supportCount; i++) {
      const angle = i * 2.1 + time * 0.1;

      // Dynamic positions
      const orbitRadius = 0.12;
      const dynamicX = centerX + Math.cos(angle) * orbitRadius * xElongation + jiggleX * (1 + 0.5 * Math.sin(i * 2.1));
      const dynamicY = centerY + Math.sin(angle) * orbitRadius * yElongation + jiggleY * (1 + 0.5 * Math.cos(i * 1.7));
      const dynamicZ = centerZ + Math.sin(angle * 0.7) * orbitRadius * zElongation + jiggleZ * (1 + 0.5 * Math.sin(i * 1.3));

      // SIMPLE LERP TO CENTER - all support blobs merge to center with delayed start
      const centeringStart = 0.1; // Don't start centering until 10% morph progress
      const adjustedMorph = Math.max(0, (easedMorph - centeringStart) / (1 - centeringStart));
      let px = THREE.MathUtils.lerp(dynamicX, 0.5, adjustedMorph);
      const py = THREE.MathUtils.lerp(dynamicY, 0.5, adjustedMorph);
      const pz = THREE.MathUtils.lerp(dynamicZ, 0.5, adjustedMorph);

      // SANDBOX MODE: Camera handles centering, keep satellites in original position
      if (sandboxMode && currentSection === 3 && centeringProgressRef.current > 0) {
        console.log(`Sandbox: Keeping satellite ${i} at original position - camera will center the view instead`);
      }

      // Maintain strength but merge position
      effect.addBall(px, py, pz, strength * 0.8 * dyn, subtract);
    }

    // Clear satellite positions array for this frame
    satellitePositionsRef.current = [];

    // THREE-PHASE MORPHING: Converge -> Gather -> Expand
    const satCount = Math.max(3, numMetaballs);

    // OVERLAPPING PHASE DEFINITIONS - better coordinated phases
    const convergePhase = Math.min(1, easedMorph * 1.2); // Convergence completes at ~83% of morph
    const gatherPhase = Math.max(0, Math.min(1, (easedMorph - 0.5) * 2.0)); // 0.5-1.0 of morph
    const rectanglePhase = Math.max(0, (easedMorph - 0.6) * 2.5); // 0.6-1.0 of morph, starts after convergence

    // ADD DISTANCE CONSTRAINT - Keep blobs within reasonable distance from center
    const MAX_DISTANCE_FROM_CENTER = params.maxDistance; // Use adjustable parameter

    for (let i = 0; i < satCount; i++) {
      // Calculate dynamic position (normal lava lamp behavior)
      const ballType = i % 3;
      // Gradually slow down motion during convergence for smooth transition
      const motionSpeed = 0.2 * (1 - easeInOutCubic(convergePhase) * 0.9);

      const thetaAngle = i * 1.05 + time * motionSpeed;
      const phiAngle = i * 0.8 + time * (motionSpeed * 0.75);
      const sinTheta = Math.sin(thetaAngle);
      const cosTheta = Math.cos(thetaAngle);
      const sinPhi = Math.sin(phiAngle);
      const cosPhi = Math.cos(phiAngle);

      // Dynamic lifecycle for size/strength - smooth transition to stabilize during morph
      let radius, ballStrength;

      // GRADUAL TRANSITION - no hard cutoffs
      const normalRadius = 0.175;
      const currentLifecycle = (time * 0.05 + i * 0.9) % 4;
      let dynamicRadius = normalRadius;

      if (currentLifecycle < 1.5) {
        dynamicRadius = 0.1 + (currentLifecycle * 0.1);
      } else if (currentLifecycle < 2.1) {
        const ejectionProgress = (currentLifecycle - 1.5) / 0.6;
        dynamicRadius = 0.25 + ejectionProgress * 0.15;
      } else if (currentLifecycle < 3.0) {
        dynamicRadius = 0.4;
      } else {
        const fallProgress = (currentLifecycle - 3.0) / 1.0;
        dynamicRadius = 0.4 - fallProgress * 0.3;
      }

      // Smooth transition from dynamic to stable radius during convergence
      const radiusT = easeInOutCubic(convergePhase) * 0.15; // Even more gradual
      radius = THREE.MathUtils.lerp(dynamicRadius, normalRadius, radiusT);

      // Smooth strength transition during convergence
      const normalStrength = strength * 0.75;
      const dynamicStrength = strength * (1.0 - (currentLifecycle < 1.5 ? currentLifecycle * 0.2 :
        currentLifecycle < 2.1 ? 0.7 - ((currentLifecycle - 1.5) / 0.6) * 0.5 :
          currentLifecycle < 3.0 ? 0.3 :
            0.3 + ((currentLifecycle - 3.0) / 1.0) * 0.7));
      ballStrength = THREE.MathUtils.lerp(dynamicStrength, normalStrength, radiusT);

      // Ensure minimum strength
      ballStrength = Math.max(ballStrength, strength * 0.25);

      // Calculate dynamic position with VERY GRADUAL jiggling reduction
      const jiggleT = easeInOutCubic(convergePhase) * 0.3; // Much more gradual reduction
      const jiggleReduction = 1.0 - jiggleT;
      let dirX, dirY, dirZ;

      if (ballType === 0) {
        dirX = sinTheta * cosPhi * radius * xElongation * 1.6 + xUndulation * jiggleReduction + jiggleX * jiggleReduction;
        dirY = sinPhi * radius * 0.9 + yUndulation * 0.3 * jiggleReduction + jiggleY * jiggleReduction;
        dirZ = cosTheta * cosPhi * radius + zUndulation * 0.3 * jiggleReduction + jiggleZ * jiggleReduction;
      }
      else if (ballType === 1) {
        dirX = sinTheta * cosPhi * radius + xUndulation * 0.3 * jiggleReduction + jiggleX * jiggleReduction;
        dirY = sinPhi * radius * yElongation * 1.1 + yUndulation * jiggleReduction + jiggleY * jiggleReduction;
        dirZ = cosTheta * cosPhi * radius + zUndulation * 0.3 * jiggleReduction + jiggleZ * jiggleReduction;
      }
      else {
        dirX = sinTheta * cosPhi * radius + xUndulation * 0.3 * jiggleReduction + jiggleX * jiggleReduction;
        dirY = sinPhi * radius + yUndulation * 0.3 * jiggleReduction + jiggleY * jiggleReduction;
        dirZ = cosTheta * cosPhi * radius * zElongation * 1.6 + zUndulation * jiggleReduction + jiggleZ * jiggleReduction;
      }

      // Dynamic position
      let dynamicX = centerX + dirX;
      let dynamicY = centerY + dirY;
      let dynamicZ = centerZ + dirZ;

      // CONSTRAIN DISTANCE FROM CENTER - Keep blobs from straying too far
      const distFromCenter = Math.sqrt(
        Math.pow(dynamicX - centerX, 2) +
        Math.pow(dynamicY - centerY, 2) +
        Math.pow(dynamicZ - centerZ, 2)
      );

      if (distFromCenter > MAX_DISTANCE_FROM_CENTER) {
        // Scale back the position to maximum allowed distance
        const scale = MAX_DISTANCE_FROM_CENTER / distFromCenter;
        dynamicX = centerX + (dynamicX - centerX) * scale;
        dynamicY = centerY + (dynamicY - centerY) * scale;
        dynamicZ = centerZ + (dynamicZ - centerZ) * scale;
      }

      // ULTRA-SMOOTH ABSORPTION - no drift, pure smooth convergence
      let convergedX, convergedY, convergedZ;

      const travelProgress = easeInOutCubic(convergePhase);

      // Simple, smooth movement with gradually decreasing speed based on progress
      const targetCenterX = 0.5, targetCenterY = 0.5, targetCenterZ = 0.5;

      // Ultra-smooth absorption with exponential slowdown near center
      const smoothProgress = travelProgress * 0.3; // Much more conservative overall speed

      // Direct linear interpolation - no complex calculations that could cause jumps
      convergedX = THREE.MathUtils.lerp(dynamicX, targetCenterX, smoothProgress);
      convergedY = THREE.MathUtils.lerp(dynamicY, targetCenterY, smoothProgress);
      convergedZ = THREE.MathUtils.lerp(dynamicZ, targetCenterZ, smoothProgress);

      // Store converged position without harsh clamping
      satellitePositionsRef.current[i] = new THREE.Vector3(convergedX, convergedY, convergedZ);

      // PHASE 2 & 3: Form rectangle from converged blobs
      if (i === expandedBlobRef.current && rectanglePhase > 0.01) { // Lower threshold to start rectangle formation earlier
        // This blob expands into rectangle
        const boxW = rectangleStateRef.current.width;
        const boxH = rectangleStateRef.current.height;
        const boxD = rectangleStateRef.current.depth;

        // Calculate rectangle center position
        const rectCenterX = rectangleStateRef.current.centerX;
        const rectCenterY = rectangleStateRef.current.centerY;
        const rectCenterZ = rectangleStateRef.current.centerZ;

        // Debug logging (only log occasionally to avoid spam)
        if (rectanglePhase > 0.01 && Math.random() < 0.01) {
          console.log(`Rectangle formation: phase=${rectanglePhase.toFixed(3)}, dimensions=${boxW.toFixed(3)}x${boxH.toFixed(3)}, center=(${rectCenterX.toFixed(3)}, ${rectCenterY.toFixed(3)}, ${rectCenterZ.toFixed(3)})`);
        }

        if (rectanglePhase > 0.01 && (boxW > 0.005 || boxH > 0.005)) { // Lower thresholds for earlier rectangle formation
          // OPTIMIZED: Much simpler rectangle formation - fewer metaballs for better performance
          const expansionProgress = easeInOutCubic(rectanglePhase);
          const baseStrength = strength * 1.0 * expansionProgress; // Increased base strength

          // PERFORMANCE OPTIMIZATION: Use only essential metaballs (9 total instead of 25+)
          // Center point - stronger for better rectangle formation
          effect.addBall(rectCenterX, rectCenterY, rectCenterZ, baseStrength * 1.5, subtract);

          // Cardinal points (4 metaballs) - start forming rectangle outline earlier
          const cardinalDistance = expansionProgress * 1.0; // Increased from 0.8
          effect.addBall(rectCenterX + boxW * cardinalDistance, rectCenterY, rectCenterZ, baseStrength * 1.2, subtract);
          effect.addBall(rectCenterX - boxW * cardinalDistance, rectCenterY, rectCenterZ, baseStrength * 1.2, subtract);
          effect.addBall(rectCenterX, rectCenterY + boxH * cardinalDistance, rectCenterZ, baseStrength * 1.2, subtract);
          effect.addBall(rectCenterX, rectCenterY - boxH * cardinalDistance, rectCenterZ, baseStrength * 1.2, subtract);

          // Corner points when expanding (4 metaballs) - start corners earlier
          if (rectanglePhase > 0.5) { // Start corners at 50% instead of 70%
            const cornerProgress = (rectanglePhase - 0.5) / 0.5; // Adjusted range
            const cornerStrength = baseStrength * 1.0 * cornerProgress; // Increased corner strength
            const cornerDistance = expansionProgress * 0.9; // Increased from 0.7

            effect.addBall(rectCenterX + boxW * cornerDistance, rectCenterY + boxH * cornerDistance, rectCenterZ, cornerStrength, subtract);
            effect.addBall(rectCenterX - boxW * cornerDistance, rectCenterY + boxH * cornerDistance, rectCenterZ, cornerStrength, subtract);
            effect.addBall(rectCenterX + boxW * cornerDistance, rectCenterY - boxH * cornerDistance, rectCenterZ, cornerStrength, subtract);
            effect.addBall(rectCenterX - boxW * cornerDistance, rectCenterY - boxH * cornerDistance, rectCenterZ, cornerStrength, subtract);
          }
        }
      } else {
        // During rectangle formation, fade out non-expanded blobs completely
        if (rectanglePhase > 0.1) {
          // Fade out other blobs during rectangle formation
          const fadeOut = 1.0 - Math.min(1.0, (rectanglePhase - 0.1) / 0.3);
          if (fadeOut > 0.01) {
            // Only render if not completely faded
            const fadeStrength = ballStrength * fadeOut * 0.3; // Much weaker
            const fadeX = THREE.MathUtils.lerp(convergedX, 0.5, rectanglePhase * 0.5);
            const fadeY = THREE.MathUtils.lerp(convergedY, 0.5, rectanglePhase * 0.5);
            const fadeZ = THREE.MathUtils.lerp(convergedZ, 0.5, rectanglePhase * 0.5);

            effect.addBall(fadeX, fadeY, fadeZ, fadeStrength, subtract);
          }
        } else {
          // Normal convergence behavior when not in rectangle mode
          const convergenceT = Math.min(1, convergePhase);

          // Calculate how much this blob should merge toward center
          const mergeProgress = easeInOutCubic(convergenceT);

          // Gradually blend individual blob position with center position
          const centerWeight = mergeProgress * 0.8; // Don't go full center too quickly
          const finalX = THREE.MathUtils.lerp(convergedX, 0.5, centerWeight);
          const finalY = THREE.MathUtils.lerp(convergedY, 0.5, centerWeight);
          const finalZ = THREE.MathUtils.lerp(convergedZ, 0.5, centerWeight);

          // Gradually increase strength as blobs get closer to center (compensate for overlap)
          const strengthMultiplier = 1.0 + mergeProgress * 0.5; // Gradually increase to 1.5x

          // Smooth fading for distant blobs - gradually fade out blobs that are farther from center
          const distanceFromCenter = Math.sqrt(
            Math.pow(convergedX - 0.5, 2) +
            Math.pow(convergedY - 0.5, 2) +
            Math.pow(convergedZ - 0.5, 2)
          );

          // Smooth visibility based on both convergence progress and distance
          const maxDistance = 0.3;
          const distanceFactor = Math.max(0.3, 1.0 - (distanceFromCenter / maxDistance));
          const convergenceFactor = 0.4 + convergenceT * 0.6; // Never below 40%, scales to 100%

          const finalStrength = ballStrength * dyn * strengthMultiplier * distanceFactor * convergenceFactor;

          // Ensure minimum visibility
          const minStrength = strength * 0.2;
          const renderStrength = Math.max(minStrength, finalStrength);

          effect.addBall(finalX, finalY, finalZ, renderStrength, subtract);
        }
      }
    }

    // OPTIMIZED isolation adjustment for better performance
    if (rectanglePhase > 0) {
      // More conservative isolation increase to maintain performance
      const isoProgress = easeInOutCubic(Math.max(0, (rectanglePhase - 0.3) / 0.7));
      const targetIso = adjustableParams.isolation * 1.2; // Reduced from 1.5x to 1.2x

      effect.isolation = adjustableParams.isolation * (1.0 - isoProgress) + targetIso * isoProgress;
    } else {
      effect.isolation = adjustableParams.isolation;
    }

    // Update the marching cubes mesh
    effect.update();
  };

  // Initialize accumulator in the component, before useFrame
  const simAccumulator = useRef(0);

  // Scroll to cycle sections and morph into cards - REPLACED WITH MENU NAVIGATION
  // Removed scroll-based navigation in favor of menu system

  // Add menu-based navigation handler
  const handleMenuSelection = (sectionIndex) => {
    console.log('handleMenuSelection called with:', sectionIndex);

    if (wheelLockedRef.current) {
      console.log('Wheel locked, returning early');
      return;
    }

    const now = Date.now();
    if (now - lastWheelActionRef.current < 350) {
      console.log('Too soon since last action, returning early');
      return;
    }

    console.log('Menu selection triggered, starting fade out...');

    // Immediately start the fade transition
    setMenuClicked(true);
    console.log(`Menu clicked: section ${sectionIndex}, current phase: ${phaseRef.current}, current section: ${currentSection}, sandbox mode: ${sandboxMode}`);

    // Don't use setTimeout - let the phase transitions control menu visibility

    if (phaseRef.current === 'lava') {
      // Special handling for Sandbox mode (section 3) - no morphing needed
      if (sectionIndex === 3) {
        if (sandboxMode && currentSection === 3) {
          console.log('Exiting sandbox mode');
          // Already in sandbox mode, clicking again should exit

          // Delay state changes to prevent jump - same as other menu options
          setTimeout(() => {
            setSandboxMode(false);
            setCurrentSection(0); // Return to projects
            // Stay in lava phase

            // Use same fade timing as other sections
            setTimeout(() => {
              setMenuClicked(false);
            }, 1200);
          }, 100); // Same delay as other menu options

          return;
        }

        console.log('Entering sandbox mode');

        // Follow EXACT same pattern as other menu options - single delayed state batch
        setTimeout(() => {
          // Batch ALL state changes together like other menu options
          setCurrentSection(sectionIndex);
          setSandboxMode(true);
          setMenuClicked(false); // Reset menu in same batch
          console.log('Sandbox mode activated after menu fade');
        }, 1200); // Same 1200ms delay as original menu fade timing

        return;
      }

      // Start morphing to rectangle for other sections
      const randomBlob = Math.floor(Math.random() * Math.max(3, adjustableParams.numMetaballs));
      expandedBlobRef.current = randomBlob;

      // IMMEDIATELY reset sandbox centering to prevent jump
      centeringProgressRef.current = 0;
      centeringEnabledRef.current = false;

      targetSectionRef.current = sectionIndex;
      setCurrentSection(sectionIndex);
      setSandboxMode(false); // Ensure sandbox mode is off for other sections
      setMorphingProgress(0.001);
      setScrollProgress(0);
      setPhaseBoth('toRect');
      wheelLockedRef.current = true;
      lastWheelActionRef.current = now;

    } else if (phaseRef.current === 'rect') {
      if (sectionIndex === 3) {
        // Sandbox mode clicked from rect phase
        console.log('Entering sandbox mode from rect phase');
        setCurrentSection(sectionIndex);
        setSandboxMode(true);
        setPhaseBoth('toLava'); // Return to lava first
        wheelLockedRef.current = true;
        lastWheelActionRef.current = now;
      } else if (currentSection === sectionIndex) {
        // Same section clicked - revert to lava
        // IMMEDIATELY reset sandbox centering to prevent jump
        centeringProgressRef.current = 0;
        centeringEnabledRef.current = false;

        setSandboxMode(false);
        setPhaseBoth('toLava');
        wheelLockedRef.current = true;
        lastWheelActionRef.current = now;
      } else {
        // Different section clicked - switch to new section
        // IMMEDIATELY reset sandbox centering to prevent jump
        centeringProgressRef.current = 0;
        centeringEnabledRef.current = false;

        setSandboxMode(false);
        queuedSectionRef.current = sectionIndex;
        setPhaseBoth('toLava');
        wheelLockedRef.current = true;
        lastWheelActionRef.current = now;
      }
    } else {
      // In transition - queue the selection
      queuedSectionRef.current = sectionIndex;
      wheelLockedRef.current = true;
      lastWheelActionRef.current = now;
    }
  };

  // Add a ref to store previous metaball state for interpolation
  const prevMetaballStateRef = useRef({
    positions: [],
    strengths: [],
    time: 0
  });

  // Modified useFrame with smoother, less choppy updates
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

    // SANDBOX MODE: Animate centering progress like rectangle morphing (using ref to avoid stutters)
    if (sandboxMode && currentSection === 3 && centeringEnabledRef.current) {
      const centeringSpeed = 0.8; // Much slower start for very gradual animation
      centeringProgressRef.current = Math.min(1, centeringProgressRef.current + delta * centeringSpeed);
      console.log(`Sandbox: Animation progress - centeringProgressRef: ${centeringProgressRef.current.toFixed(3)}, enabled: ${centeringEnabledRef.current}`);
    } else if (!sandboxMode || currentSection !== 3) {
      // Reset centering when not in sandbox mode
      if (centeringProgressRef.current > 0) {
        centeringProgressRef.current = 0;
        centeringEnabledRef.current = false;
      }
    }

    // Current time for animation
    const currentTime = sim.clock.getElapsedTime();

    // Update sim.time smoothly
    sim.time += delta * sim.speed;

    // Apply eased morph value and calculate rectangle phase once
    const easedMorph = easeInOutCubic(morphRef.current);
    // Calculate rectangle phase (when blobs should expand into rectangle)
    const rectanglePhase = Math.max(0, (easedMorph - 0.5) * 2.0); // Start rectangle at 50% morph instead of 65%

    // SMOOTHER RECTANGLE INTERPOLATION - update every frame during morph
    if (easedMorph > 0) { // Changed from 0.001 to 0
      const lerpSpeed = 4 * delta; // Slightly reduced for smoother motion

      // Multi-stage interpolation for different phases
      const convergeT = easeOutQuad(Math.min(1, easedMorph * 1.5)); // Quicker convergence
      const expandT = easeInOutCubic(Math.max(0, (easedMorph - 0.5) / 0.5)); // Rectangle expansion starts at 50% and completes at 100%

      // Center the rectangle as it enlarges - move from side position to center
      const isMobileView = window.innerWidth < 768;
      const sideCenterX = isMobileView ? 0.5 : 0.3;  // Start position (adjusted for centered container)
      const finalCenterX = 0.5;  // Final centered position

      // Smooth transition to center during expansion - start later to avoid initial jump
      const centeringProgress = easeInOutCubic(Math.max(0, (easedMorph - 0.3) / 0.7)); // Start centering at 30% progress instead of 20%

      targetRectangleStateRef.current.centerX = THREE.MathUtils.lerp(sideCenterX, finalCenterX, centeringProgress);
      targetRectangleStateRef.current.centerY = 0.5;  // Always centered vertically
      targetRectangleStateRef.current.centerZ = 0.5;  // Always centered in depth

      // Rectangle dimensions expand more smoothly - card-like proportions
      targetRectangleStateRef.current.width = 0.25 * expandT;  // Increased from 0.15 for better visibility
      targetRectangleStateRef.current.height = 0.35 * expandT; // Increased from 0.20 for better visibility
      targetRectangleStateRef.current.depth = 0.05 * expandT;  // Increased from 0.02 for better visibility

      // Debug logging for expansion calculation
      if (Math.random() < 0.01) { // Log occasionally to avoid spam
        console.log(`Expansion: easedMorph=${easedMorph.toFixed(3)}, expandT=${expandT.toFixed(3)}, targetWidth=${(0.25 * expandT).toFixed(3)}, targetHeight=${(0.35 * expandT).toFixed(3)}`);
      }

      // Smooth interpolation to targets with faster speed for rectangle dimensions
      const currentLerpSpeed = lerpSpeed * 2.0; // Increased from 0.7 for faster rectangle formation
      rectangleStateRef.current.centerX += (targetRectangleStateRef.current.centerX - rectangleStateRef.current.centerX) * currentLerpSpeed;
      rectangleStateRef.current.centerY += (targetRectangleStateRef.current.centerY - rectangleStateRef.current.centerY) * currentLerpSpeed;
      rectangleStateRef.current.centerZ += (targetRectangleStateRef.current.centerZ - rectangleStateRef.current.centerZ) * currentLerpSpeed;
      rectangleStateRef.current.width += (targetRectangleStateRef.current.width - rectangleStateRef.current.width) * currentLerpSpeed;
      rectangleStateRef.current.height += (targetRectangleStateRef.current.height - rectangleStateRef.current.height) * currentLerpSpeed;
      rectangleStateRef.current.depth += (targetRectangleStateRef.current.depth - rectangleStateRef.current.depth) * currentLerpSpeed;

      // Apply bounds checking to keep rectangle within reasonable limits
      const margin = 0.1; // 10% margin from edges
      rectangleStateRef.current.centerX = THREE.MathUtils.clamp(rectangleStateRef.current.centerX, margin, 1 - margin);
      rectangleStateRef.current.centerY = THREE.MathUtils.clamp(rectangleStateRef.current.centerY, margin, 1 - margin);
      rectangleStateRef.current.centerZ = THREE.MathUtils.clamp(rectangleStateRef.current.centerZ, margin, 1 - margin);

      // Camera positioning for rectangles only (not sandbox)
      if (!isMobileView && camera && !sandboxMode) {
        // Rectangle centering logic for normal mode only - start later to coordinate with blob centering
        const cameraCenteringProgress = easeInOutCubic(Math.max(0, (easedMorph - 0.3) / 0.7)); // Match blob centering timing
        const sideX = 6;  // Starting side position (centered container)
        const targetX = 0; // Target position to look at
        const currentX = THREE.MathUtils.lerp(sideX, targetX, cameraCenteringProgress);

        // Smoothly interpolate camera position
        const lerpSpeed = delta * 2;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, currentX, lerpSpeed);
        camera.lookAt(currentX, 0, 0);
        camera.updateProjectionMatrix();
      }
    }

    // SANDBOX MODE: Camera positioning to center the lava lamp
    if (sandboxMode && currentSection === 3 && centeringProgressRef.current > 0) {
      const isMobileView = window.innerWidth < 768;
      if (!isMobileView && camera) {
        // Similar to rectangle centering - smoothly move camera to center position
        const sideX = 6;  // Starting side position (same as normal mode)
        const targetX = 0; // Target center position
        const rawProgress = centeringProgressRef.current; // Raw linear progress
        const easedProgress = easeInOutCubic(rawProgress); // Apply easing
        const currentX = THREE.MathUtils.lerp(sideX, targetX, easedProgress);

        // Smoothly interpolate camera position
        const lerpSpeed = delta * 3; // Slightly faster than rectangle mode
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, currentX, lerpSpeed);
        camera.lookAt(currentX, 0, 0);
        camera.updateProjectionMatrix();

        console.log(`Sandbox: Camera centering - rawProgress: ${rawProgress.toFixed(3)}, easedProgress: ${easedProgress.toFixed(3)}, currentX: ${currentX.toFixed(3)}, camera.position.x: ${camera.position.x.toFixed(3)}`);
      }
    }

    // Handle camera positioning and rectangle state resets based on current mode
    if (phaseRef.current === 'lava' && easedMorph <= 0.001) {
      // Reset rectangle state when truly in lava phase
      rectangleStateRef.current = {
        centerX: 0.5,
        centerY: 0.5,
        centerZ: 0.5,
        width: 0,
        height: 0,
        depth: 0
      };
      targetRectangleStateRef.current = {
        centerX: 0.5,
        centerY: 0.5,
        centerZ: 0.5,
        width: 0,
        height: 0,
        depth: 0
      };

      // Reset camera to side position when returning to lava state (desktop/tablet only)
      // But only if NOT in sandbox mode (sandbox handles its own camera positioning)
      const isMobileView = window.innerWidth < 768;
      if (!isMobileView && camera && !sandboxMode) {
        const sideX = 6;  // Side position for lava state (centered container)
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, sideX, delta * 2);
        camera.lookAt(sideX, 0, 0);
        camera.updateProjectionMatrix();
      }
    }

    // Smoother position drift - reduce drift when rectangle is forming
    // Apply gradual drift reduction to prevent sudden jumps when morphing starts
    const morphingStarted = easedMorph > 0;
    const driftFactor = morphingStarted ? Math.max(0.1, (1.0 - easedMorph)) : 1.0; // Never go below 10% drift
    const drift = driftFactor * 0.5; // Reduce drift magnitude
    const driftSpeed = 0.15; // Slower drift
    const driftReduction = rectanglePhase > 0 ? (1 - rectanglePhase * 0.8) : 1; // Reduce drift when rectangle forms

    effect.position.x = Math.sin(currentTime * driftSpeed) * 0.05 * drift * driftReduction;
    effect.position.y = Math.sin(currentTime * driftSpeed * 0.5) * 0.025 * drift * driftReduction;
    effect.position.z = Math.sin(currentTime * driftSpeed * 0.85) * 0.05 * drift * driftReduction;

    // Smoother rotation handling
    if (easedMorph < 0.01) {
      // Lava lamp state - normal rotation
      effect.rotation.y += 0.002;
    } else if (easedMorph > 0.99) {
      // Rectangle state - lock facing forward
      effect.rotation.y = THREE.MathUtils.lerp(effect.rotation.y, 0, 0.1);
      effect.rotation.x = THREE.MathUtils.lerp(effect.rotation.x, 0, 0.1);
      effect.rotation.z = THREE.MathUtils.lerp(effect.rotation.z, 0, 0.1);
    } else {
      // Transitioning - smooth interpolation to front-facing
      const rotLerp = easedMorph * 0.05;
      effect.rotation.y = THREE.MathUtils.lerp(effect.rotation.y, 0, rotLerp);
      effect.rotation.x = THREE.MathUtils.lerp(effect.rotation.x, 0, rotLerp);
      effect.rotation.z = THREE.MathUtils.lerp(effect.rotation.z, 0, rotLerp);
    }

    // BALANCED MORPHING PROGRESSION - slower convergence timing
    const toRectDuration = 4.5; // Increased from 3.0 for slower convergence
    const toLavaDuration = 2.0; // Reduced from 2.5
    const lavaHoldDuration = 0.3; // Keep the same

    if (phaseRef.current === 'toRect') {
      setMorphingProgress((p) => {
        // Use smaller increments for smoother animation
        const increment = delta / toRectDuration;
        const np = Math.min(1, p + increment);
        if (np >= 1) {
          setPhaseBoth('rect');
          setMenuHidden(true); // Hide menu when rectangle is fully formed
          wheelLockedRef.current = false;
          hasCompletedFirstCycle.current = true;
        }
        return np;
      });
    } else if (phaseRef.current === 'toLava') {
      setMorphingProgress((p) => {
        // Use smaller decrements for smoother animation
        const decrement = delta / toLavaDuration;
        const np = Math.max(0, p - decrement);
        if (np <= 0) {
          // Reset states when fully back to lava
          rectangleStateRef.current = {
            centerX: 0.5,
            centerY: 0.5,
            centerZ: 0.5,
            width: 0,
            height: 0,
            depth: 0
          };
          targetRectangleStateRef.current = {
            centerX: 0.5,
            centerY: 0.5,
            centerZ: 0.5,
            width: 0,
            height: 0,
            depth: 0
          };

          if (queuedSectionRef.current !== null) {
            setPhaseBoth('lavaHold');
            setTimeout(() => {
              if (phaseRef.current === 'lavaHold') {
                const nxt = queuedSectionRef.current;
                queuedSectionRef.current = null;
                targetSectionRef.current = nxt;
                setCurrentSection(nxt);

                // Pick the closest visible blob
                if (satellitePositionsRef.current.length > 0) {
                  let closestIdx = 0;
                  let closestDist = Infinity;
                  const center = new THREE.Vector3(0.5, 0.5, 0.5);

                  for (let i = 0; i < satellitePositionsRef.current.length; i++) {
                    if (i === expandedBlobRef.current) continue;
                    const pos = satellitePositionsRef.current[i];
                    if (pos) {  // ADD PARENTHESES HERE
                      const dist = pos.distanceTo(center);
                      if (dist < closestDist) {
                        closestDist = dist;
                        closestIdx = i;
                      }
                    }
                  }

                  // Set the chosen blob position to the closest one
                  chosenBlobPosRef.current.copy(satellitePositionsRef.current[closestIdx]);
                }

                setMorphingProgress(0); // Start from true 0 instead of 0.001
                setScrollProgress(0);
                setPhaseBoth('toRect');
              }
            }, lavaHoldDuration * 1000);
          } else {
            setPhaseBoth('lava');
            setMenuHidden(false); // Show menu when returning to lava phase
            setMenuClicked(false); // Reset clicked state
          }
        }
        return np;
      });
    }

    // Metaball simulation update - smoother and more stable
    if (sim.lastTime !== 0) {
      const elapsed = sim.clock.getElapsedTime() - sim.lastTime;
      sim.time += elapsed * sim.speed;
    }
    sim.lastTime = sim.clock.getElapsedTime();

    // Update simulation speed and strength from adjustable parameters
    sim.speed = adjustableParams.speed;
    sim.strength = adjustableParams.strength;

    // Update metaballs with adaptive quality
    if (marchingCubesRef.current) {
      const quality = Math.min(1.0, Math.max(0.5, perfRef.current.quality));

      // RECTANGLE PERFORMANCE OPTIMIZATION: Reduce update frequency during rectangle formation
      let updateFrequency = 1;

      if (rectanglePhase > 0) {
        // During rectangle formation, update less frequently for better performance
        updateFrequency = rectanglePhase > 0.8 ? 3 : 2; // Every 2-3 frames during rectangle
      }

      if (quality < 1.0 || rectanglePhase > 0) {
        // Skip some updates to reduce load
        const skipFrames = rectanglePhase > 0 ? updateFrequency : Math.ceil(1 / quality);
        if (sim.frameCount % skipFrames === 0) {
          updateMetaballs(
            marchingCubesRef.current,
            sim.time,
            adjustableParams.numMetaballs,
            adjustableParams.strength,
            sim.subtract,
            morphRef.current,
            adjustableParams
          );
        }
      } else {
        // Full quality - regular updates (only when not in rectangle mode)
        updateMetaballs(
          marchingCubesRef.current,
          sim.time,
          adjustableParams.numMetaballs,
          adjustableParams.strength,
          sim.subtract,
          morphRef.current,
          adjustableParams
        );
      }
    }

    // Performance management - adjust quality based on frame time
    const fps = 1 / delta;

    // More aggressive performance adjustment during rectangle formation
    if (rectanglePhase > 0) {
      // Lower FPS threshold during rectangle formation
      if (fps < 15) {
        perfRef.current.quality = Math.max(0.3, perfRef.current.quality - 0.1); // More aggressive reduction
      } else if (fps > 25) {
        perfRef.current.quality = Math.min(0.8, perfRef.current.quality + 0.05); // Cap at 0.8 during rectangle
      }
    } else {
      // Normal performance management during lava mode
      if (fps < 10) {
        perfRef.current.quality = Math.min(1.0, perfRef.current.quality + 0.05);
      } else if (fps > 30) {
        perfRef.current.quality = Math.max(0.5, perfRef.current.quality - 0.05);
      }
    }

    // Track frame count for performance analysis
    sim.frameCount++;
  });

  // Slider Control Panel Component
  const ControlPanel = ({ params, responsiveScale, onParamChange, embedded = false }) => {
    const [isVisible, setIsVisible] = useState(true);

    const resetToDefaults = () => {
      const defaults = {
        numMetaballs: 1,
        isolation: 300,
        strength: 4.2,
        internalWarpStrength: 0.1,
        asymmetryFactor: 20,
        jiggleIntensity: 0,
        maxDistance: 0.35,
        speed: 1.02
      };

      // Update all parameters at once
      Object.keys(defaults).forEach(key => {
        onParamChange(key, defaults[key]);
      });
    };

    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth < 1200;

    const sliderStyle = {
      margin: isMobile ? '6px 0' : '8px 0',
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '6px' : '8px',
      justifyContent: 'space-between'
    };

    const labelStyle = {
      minWidth: isMobile ? '90px' : (isTablet ? '110px' : '130px'),
      fontSize: embedded ? '12px' : (isMobile ? '10px' : (isTablet ? '11px' : '12px')),
      color: embedded ? 'rgba(255, 255, 255, 0.9)' : '#333',
      flexShrink: 0,
      textShadow: embedded ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
    };

    const inputStyle = {
      width: isMobile ? '80px' : (isTablet ? '90px' : '100px'),
      height: isMobile ? '18px' : '20px',
      flexShrink: 0
    };

    const valueStyle = {
      minWidth: isMobile ? '35px' : '45px',
      fontSize: embedded ? '11px' : (isMobile ? '9px' : '11px'),
      color: embedded ? 'rgba(255, 255, 255, 0.8)' : '#666',
      textAlign: 'right',
      paddingLeft: '5px',
      textShadow: embedded ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
    };

    const buttonStyle = {
      background: embedded ? 'rgba(255, 255, 255, 0.1)' : '#f0f0f0',
      border: embedded ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #ccc',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '11px',
      cursor: 'pointer',
      marginTop: '10px',
      width: '100%',
      color: embedded ? 'white' : '#333',
      backdropFilter: embedded ? 'blur(10px)' : 'none',
      textShadow: embedded ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
      transition: 'all 0.2s ease'
    };

    const panelStyle = embedded ? {
      background: 'transparent',
      padding: '0',
      borderRadius: '0',
      boxShadow: 'none',
      zIndex: 'auto',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      width: '100%',
      opacity: 1,
      pointerEvents: 'auto'
    } : {
      position: 'fixed',
      top: isMobile ? '10px' : '20px',
      right: isMobile ? '10px' : '20px',
      background: 'rgba(255, 255, 255, 0.95)',
      padding: isMobile ? '8px' : (isTablet ? '12px' : '15px'),
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      zIndex: 10000,
      fontFamily: 'Arial, sans-serif',
      fontSize: isMobile ? '10px' : (isTablet ? '11px' : '12px'),
      maxHeight: '80vh',
      overflowY: 'auto',
      width: isMobile ? '220px' : (isTablet ? '260px' : '300px'),
      transition: 'opacity 0.3s ease',
      opacity: isVisible ? 1 : 0.3,
      pointerEvents: 'auto'
    };

    const toggleStyle = {
      position: 'absolute',
      top: '5px',
      right: '8px',
      background: 'none',
      border: 'none',
      fontSize: '16px',
      cursor: 'pointer',
      opacity: 0.7
    };

    return (
      <div style={panelStyle} onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        <button style={toggleStyle} onClick={() => setIsVisible(!isVisible)}>
          {isVisible ? '−' : '+'}
        </button>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#222' }}>
          Lava Lamp Controls
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 'normal' }}>
            Settings auto-saved • Scale: {(responsiveScale * 100).toFixed(0)}%
          </div>
        </h3>

        <div style={sliderStyle}>
          <label style={labelStyle}>Metaballs:</label>
          <input
            type="range"
            min="1"
            max="15"
            step="1"
            value={params.numMetaballs}
            onChange={(e) => onParamChange('numMetaballs', parseInt(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.numMetaballs}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Isolation:</label>
          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={params.isolation}
            onChange={(e) => onParamChange('isolation', parseInt(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.isolation}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Strength:</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={params.strength}
            onChange={(e) => onParamChange('strength', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.strength}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Warp Strength:</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={params.internalWarpStrength}
            onChange={(e) => onParamChange('internalWarpStrength', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.internalWarpStrength}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Asymmetry:</label>
          <input
            type="range"
            min="0.1"
            max="20"
            step="0.1"
            value={params.asymmetryFactor}
            onChange={(e) => onParamChange('asymmetryFactor', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.asymmetryFactor}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Jiggle:</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={params.jiggleIntensity}
            onChange={(e) => onParamChange('jiggleIntensity', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.jiggleIntensity}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Max Distance:</label>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.05"
            value={params.maxDistance}
            onChange={(e) => onParamChange('maxDistance', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.maxDistance}</span>
        </div>

        <div style={sliderStyle}>
          <label style={labelStyle}>Speed:</label>
          <input
            type="range"
            min="0.01"
            max="2"
            step="0.01"
            value={params.speed}
            onChange={(e) => onParamChange('speed', parseFloat(e.target.value))}
            style={inputStyle}
          />
          <span style={valueStyle}>{params.speed}</span>
        </div>

        <button
          style={buttonStyle}
          onClick={resetToDefaults}
          onMouseOver={(e) => e.target.style.background = '#e0e0e0'}
          onMouseOut={(e) => e.target.style.background = '#f0f0f0'}
        >
          Reset to Defaults
        </button>
      </div>
    );
  };

  // Glassmorphism Sandbox Panel Component
  const SandboxPanel = () => {
    console.log('SandboxPanel render check:', {
      sandboxMode,
      currentSection,
      phase,
      shouldShow: sandboxMode && currentSection === 3
    });

    if (!sandboxMode || currentSection !== 3) {
      console.log('SandboxPanel not showing - conditions not met:', {
        sandboxMode,
        currentSection,
        requiredSection: 3
      });
      return null;
    }

    console.log('SandboxPanel showing!');

    // Test div to ensure rendering works
    return (
      <>
        {/* Simple test div */}
        <div style={{
          position: 'fixed',
          top: '100px',
          left: '100px',
          width: '200px',
          height: '100px',
          background: 'red',
          zIndex: 60000,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          fontWeight: 'bold'
        }}>
          SANDBOX TEST
        </div>

        <div style={panelStyle}>
          <div style={headerStyle}>
            <h2 style={titleStyle}>🎛️ Sandbox Mode</h2>
            <p style={subtitleStyle}>Experiment with lava lamp parameters and color themes in real-time</p>
          </div>

          <div style={contentStyle}>
            {/* Lava Lamp Controls Section */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>🌊 Lava Lamp Controls</h3>
              <ControlPanel
                params={adjustableParams}
                responsiveScale={responsiveScale}
                onParamChange={(param, value) => {
                  setAdjustableParams(prev => ({ ...prev, [param]: value }));
                }}
                embedded={true}
              />
            </div>

            {/* Color Themes Section */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>🎨 Color Themes</h3>
              <ColorThemePanel />
            </div>
          </div>
        </div>

        {/* Add keyframe animation via injected style */}
        <style>
          {`
            @keyframes sandboxFadeIn {
              from { 
                opacity: 0; 
                transform: translate(-50%, -50%) scale(0.9);
              }
              to { 
                opacity: 1; 
                transform: translate(-50%, -50%) scale(1);
              }
            }
          `}
        </style>
      </>
    );

    const panelStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90vw',
      maxWidth: '900px',
      height: '70vh',
      minHeight: '400px',
      background: 'rgba(255, 0, 0, 0.9)', // Bright red background for debugging
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRadius: '24px',
      border: '5px solid yellow', // Bright yellow border for debugging
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      zIndex: 50000, // Much higher z-index
      overflow: 'auto',
      animation: 'sandboxFadeIn 0.5s ease-out',
      display: 'flex',
      flexDirection: 'column'
    };

    const headerStyle = {
      padding: '24px 32px 16px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))'
    };

    const titleStyle = {
      color: 'white',
      fontSize: '24px',
      fontWeight: '600',
      margin: '0 0 8px 0',
      textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
    };

    const subtitleStyle = {
      color: 'rgba(255, 255, 255, 0.8)',
      fontSize: '14px',
      margin: 0,
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
    };

    const contentStyle = {
      padding: '24px 32px',
      flex: 1,
      display: 'grid',
      gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr',
      gap: '32px',
      overflowY: 'auto'
    };

    const sectionStyle = {
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    };

    const sectionTitleStyle = {
      color: 'white',
      fontSize: '18px',
      fontWeight: '500',
      margin: '0 0 16px 0',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
    };

    return (
      <>
        <div style={panelStyle}>
          <div style={headerStyle}>
            <h2 style={titleStyle}>🎛️ Sandbox Mode</h2>
            <p style={subtitleStyle}>Experiment with lava lamp parameters and color themes in real-time</p>
          </div>

          <div style={contentStyle}>
            {/* Lava Lamp Controls Section */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>🌊 Lava Lamp Controls</h3>
              <ControlPanel
                params={adjustableParams}
                responsiveScale={responsiveScale}
                onParamChange={(param, value) => {
                  setAdjustableParams(prev => ({ ...prev, [param]: value }));
                }}
                embedded={true}
              />
            </div>

            {/* Color Themes Section */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>🎨 Color Themes</h3>
              <ColorThemePanel />
            </div>
          </div>
        </div>

        {/* Add keyframe animation via injected style */}
        <style>
          {`
            @keyframes sandboxFadeIn {
              from { 
                opacity: 0; 
                transform: translate(-50%, -50%) scale(0.9);
              }
              to { 
                opacity: 1; 
                transform: translate(-50%, -50%) scale(1);
              }
            }
          `}
        </style>
      </>
    );
  };

  // Color Theme Panel Component
  const ColorThemePanel = () => {
    const colorThemes = [
      { name: 'Ocean', base: new THREE.Color(0x4FC3F7), highlight: new THREE.Color(0x29B6F6), background: new THREE.Color(0x0D47A1) },
      { name: 'Sunset', base: new THREE.Color(0xFF7043), highlight: new THREE.Color(0xFF5722), background: new THREE.Color(0xBF360C) },
      { name: 'Forest', base: new THREE.Color(0x66BB6A), highlight: new THREE.Color(0x4CAF50), background: new THREE.Color(0x1B5E20) },
      { name: 'Purple', base: new THREE.Color(0xAB47BC), highlight: new THREE.Color(0x9C27B0), background: new THREE.Color(0x4A148C) },
      { name: 'Gold', base: new THREE.Color(0xFFD54F), highlight: new THREE.Color(0xFFC107), background: new THREE.Color(0xFF8F00) },
      { name: 'Ice', base: new THREE.Color(0x81D4FA), highlight: new THREE.Color(0x03A9F4), background: new THREE.Color(0x01579B) }
    ];

    const themeGridStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      marginTop: '8px'
    };

    const themeButtonStyle = (theme) => ({
      padding: '12px',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      background: `linear-gradient(135deg, rgb(${theme.base.r * 255}, ${theme.base.g * 255}, ${theme.base.b * 255}), rgb(${theme.highlight.r * 255}, ${theme.highlight.g * 255}, ${theme.highlight.b * 255}))`,
      color: 'white',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
    });

    const applyTheme = (theme) => {
      setColor1(theme.base);
      setColor2(theme.highlight);
      // You can also update background color if needed
    };

    return (
      <div style={themeGridStyle}>
        {colorThemes.map((theme, index) => (
          <button
            key={index}
            style={themeButtonStyle(theme)}
            onClick={() => applyTheme(theme)}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.05)';
              e.target.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = 'none';
            }}
          >
            {theme.name}
          </button>
        ))}
      </div>
    );
  };

  // Navigation Menu Component
  const NavigationMenu = () => {
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth < 1200;

    // Debug window size
    console.log('Window size:', window.innerWidth, 'isMobile:', isMobile);

    // Calculate opacity based on state - faster fade transition
    const getMenuOpacity = () => {
      // Handle menuClicked fade animation first (for all modes including sandbox)
      if (menuClicked) {
        return Math.max(0, 1 - menuFadeProgress);
      }

      // Keep menu hidden in sandbox mode after fade completes
      if (sandboxMode && currentSection === 3) return 0;

      if (phase === 'rect') return 0;
      if (phase === 'toRect') {
        // Much faster fade - complete in first 20% of transition
        const fadeStart = 0.05; // Start fading at 5% of transition
        const fadeEnd = 0.2;    // Complete fade at 20% of transition
        if (morphingProgress <= fadeStart) return 1;
        if (morphingProgress >= fadeEnd) return 0;
        const fadeProgress = (morphingProgress - fadeStart) / (fadeEnd - fadeStart);
        return 1 - fadeProgress;
      }
      if (phase === 'toLava') {
        // Fade back in during return transition
        const fadeProgress = 1 - morphingProgress;
        return Math.min(1, fadeProgress * 1.2); // Slightly faster fade in
      }
      // Default lava state - return 1 for normal visibility
      return 1;
    };

    const currentOpacity = getMenuOpacity();

    // Debug logging
    console.log('Menu state render:', {
      phase,
      morphingProgress,
      menuClicked,
      opacity: currentOpacity,
      currentSection,
      sandboxMode
    });

    const menuStyle = {
      position: 'fixed',
      // Side-by-side layout: menu on right side for desktop/tablet, bottom for mobile
      ...(isMobile
        ? {
          left: '50%',
          bottom: '30px',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'row',
          gap: '20px',
          justifyContent: 'center'
        }
        : {
          left: '50%',  // Start from center
          top: '50%',
          transform: 'translateY(-50%) translateX(120%)',  // Move much much further right
          display: 'flex',
          flexDirection: 'column'
        }
      ),
      zIndex: 10000,
      fontFamily: 'Arial, sans-serif',
      opacity: currentOpacity,
      pointerEvents: (currentOpacity < 0.1) ? 'none' : 'auto',
      // Force hardware acceleration
      willChange: 'opacity',
      backfaceVisibility: 'hidden',
    };

    const menuItemStyle = (isActive, isHovered) => ({
      display: 'flex',
      alignItems: 'center',
      margin: isMobile ? '0 10px' : '20px 0',  // Horizontal spacing for mobile, vertical for desktop
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      transform: isHovered ? (isMobile ? 'translateY(-5px)' : 'translateX(10px)') : 'translate(0)',
      padding: '8px 12px',
      borderRadius: '6px',
      background: isHovered
        ? `rgba(${Math.round(baseColor.r * 255)}, ${Math.round(baseColor.g * 255)}, ${Math.round(baseColor.b * 255)}, 0.9)`
        : 'transparent',
    });

    const labelStyle = (isActive, isHovered) => ({
      color: isHovered
        ? `rgb(${Math.round(backgroundColor.r * 255)}, ${Math.round(backgroundColor.g * 255)}, ${Math.round(backgroundColor.b * 255)})`
        : `rgb(${Math.round(baseColor.r * 255)}, ${Math.round(baseColor.g * 255)}, ${Math.round(baseColor.b * 255)})`,
      fontSize: isMobile ? '14px' : (isTablet ? '16px' : '18px'),
      fontWeight: isActive ? 'bold' : '500',
      transition: 'all 0.3s ease',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    });

    const [hoveredIndex, setHoveredIndex] = useState(null);

    return (
      <div style={menuStyle}>
        {portfolioSections.map((section, index) => {
          const isActive = currentSection === index && phase === 'rect';
          const isHovered = hoveredIndex === index;

          return (
            <div
              key={section.id}
              style={menuItemStyle(isActive, isHovered)}
              onClick={() => {
                console.log('Menu item clicked:', { section: section.name, index, sectionId: section.id });
                handleMenuSelection(index);
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span style={labelStyle(isActive, isHovered)}>
                {section.name}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Back to Menu Component - appears when rectangle is open
  const BackToMenu = () => {
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth < 1200;

    // Only show when rectangle is open
    const isBackVisible = phase === 'rect';

    const backButtonStyle = {
      position: 'fixed',
      top: isMobile ? '20px' : '30px',
      left: isMobile ? '20px' : '30px',
      zIndex: 10001,
      opacity: isBackVisible ? 1 : 0,
      pointerEvents: isBackVisible ? 'auto' : 'none',
      transition: 'opacity 0.3s ease',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '6px' : '8px',
      padding: isMobile ? '8px 12px' : '10px 16px',
      background: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '25px',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    };

    const iconStyle = {
      width: isMobile ? '16px' : '20px',
      height: isMobile ? '16px' : '20px',
      color: '#ffffff',
      strokeWidth: '2px',
    };

    const textStyle = {
      color: '#ffffff',
      fontSize: isMobile ? '12px' : '14px',
      fontWeight: '500',
      fontFamily: 'Arial, sans-serif',
      letterSpacing: '0.5px',
    };

    const handleBackClick = () => {
      if (phase === 'rect') {
        setPhaseBoth('toLava');
        setMenuHidden(false); // Show menu again when going back to lava
        setMenuClicked(false); // Reset clicked state
        wheelLockedRef.current = true;
        lastWheelActionRef.current = Date.now();
      }
    };

    return (
      <div style={backButtonStyle} onClick={handleBackClick}>
        <svg style={iconStyle} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {!isMobile && <span style={textStyle}>Back to Menu</span>}
      </div>
    );
  };

  return (
    <group>
      {marchingCubesRef.current && <primitive object={marchingCubesRef.current} />}
      {!(sandboxMode && currentSection === 3) && <OrbitControls enableZoom={false} />}
      <Stats />
      <Html>
        <NavigationMenu />
        <BackToMenu />

        {/* Glassmorphism Sandbox Controls Panel */}
        {sandboxMode && currentSection === 3 && (
          <div style={{
            position: 'fixed',
            right: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '320px',
            maxHeight: '80vh',
            overflowY: 'auto',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '24px',
            zIndex: 15000,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          }}>
            <div style={{
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <h2 style={{
                margin: '0 0 8px 0',
                fontSize: '20px',
                fontWeight: '600',
                color: 'rgba(255, 255, 255, 0.9)',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
              }}>
                🎛️ Sandbox Mode
              </h2>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.7)',
                lineHeight: '1.4'
              }}>
                Experiment with lava lamp parameters
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '500',
                color: 'rgba(255, 255, 255, 0.8)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                paddingBottom: '8px'
              }}>
                🌊 Lava Lamp Controls
              </h3>
              <ControlPanel
                params={adjustableParams}
                responsiveScale={responsiveScale}
                onParamChange={(param, value) => {
                  setAdjustableParams(prev => ({ ...prev, [param]: value }));
                }}
                embedded={true}
              />
            </div>

            <div>
              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: '500',
                color: 'rgba(255, 255, 255, 0.8)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                paddingBottom: '8px'
              }}>
                🎨 Color Themes
              </h3>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.6)',
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '20px'
              }}>
                Color themes are controlled globally
              </p>
            </div>
          </div>
        )}

        {/* Debug info */}
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          zIndex: 20000,
          fontFamily: 'monospace'
        }}>
          Phase: {phase} | Section: {currentSection} | Sandbox: {String(sandboxMode)} | MenuClicked: {String(menuClicked)}
        </div>
      </Html>
    </group>
  );
};

export default LavaLampModel;