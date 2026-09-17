import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import './Scene.css';
import './SymbioteOverlay.css';
import EntityDisplay from './EntityDisplay';
import LabPanel from './LabPanel';
import InkEjection from './InkEjection';
import SuspendedFluid from './SuspendedFluid.jsx';
import { menuBlobScale, menuLayout } from './blobSizing';
import { measureMenuReference, keepBlobClearOfMenu } from './menuComposition';
import { sampleInkTargets, COMPOSE_DURATION } from './inkTargets';
import { useBlobTimeline, useManagedTimeout } from './useBlobTimeline';
import { bodyDissolve } from './blobTimeline';
import { createQualityController, updateQuality } from './qualityController';
import { createLavaLampMaterial } from './lavaMaterial';
import { useBlobSlicing } from './useBlobSlicing';
import { warmPortrait } from './portraitAsset';
import { menuInkState, menuInkParticle, visibleContentTargets } from './menuInk';

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
const ASYMMETRY_FACTOR = 0.5; // Further reduced from 1 for smoother movement
const INTERNAL_WARP_STRENGTH = 1.0; // Reduced from 1.5 for less chaotic movement

// Simplify shape for smoother appearance
const ELONGATION_FACTOR = 0.6; // Reduced from 0.8 for less stretching
const SHAPE_COMPLEXITY = 1; // Keep minimal for smoother appearance
const DISTORTION_AMOUNT = 0.05; // Reduced from 0.1 for smoother surface

// Reduce jiggling for more stable main mass
const JIGGLE_INTENSITY = 0.1; // Reduced from 0.3 for much less chaotic movement

// First, modify your initialization effect to make a cleaner separation between
// material creation and simulation state

// Add this function outside the component to keep shader code consistent
// Smooth easing function for camera movement
const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// Text Clipping Component - creates text mask texture for shader
const LavaLampModel = ({ baseColor, highlightColor, backgroundColor, portfolioData, viewport = {
  width: window.innerWidth,
  height: window.innerHeight,
  aspectRatio: window.innerWidth / window.innerHeight
} }) => {
  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    []
  );
  useEffect(() => {
    const warm = () => { warmPortrait().catch(() => {}); };
    if (window.requestIdleCallback) {
      const idle = window.requestIdleCallback(warm, { timeout: 1500 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(warm, 300);
    return () => window.clearTimeout(timer);
  }, []);
  const entityImpulse = useRef(0);
  const entityChapter = useRef(0);
  const entityPointer = useRef({ x: 0, y: 0 });
  const entityTransfer = useRef({ startedAt: -Infinity, origin: { x: 0, y: 0 }, target: { x: 0, y: 0 } });
  const navigationRef = useRef(null);
  const previousPhaseRef = useRef('lava');
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
      title: "Selected Projects",
      description: "Production systems, complete products, and open-source infrastructure.",
      items: ["Chevron document platform", "Meshwright", "Field-safety product"],
    },
    {
      id: 1,
      name: "Seena",
      path: "/seena",
      color: new THREE.Color(0x222222),
      title: "Seena Abed",
      description: "Professional experience, capabilities, and education.",
      items: ["Experience", "Capabilities", "Education"],
    },
    {
      id: 3,
      name: "Lab",
      path: "/sandbox",
      color: new THREE.Color(0x9966ff),
      title: "Interaction Lab",
      description: "Experiment directly with the fluid system behind the portfolio.",
      items: ["Lava controls", "Surface behavior", "Real-time rendering"],
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

  // Enable stencil buffer for text clipping
  useEffect(() => {
    gl.stencil = true;
    gl.autoClear = false;
    gl.setClearColor(0x000000, 0);
  }, [gl]);

  const [stats, setStats] = useState({ fps: 0 });

  // Scroll/morph state
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState(0);
  const scrollAccumulator = useRef(0);
  const morphRef = useRef(0);

  // Morph phase state machine: 'lava' -> 'toRect' -> 'rect' -> 'toLava'
  const [phase, setPhase] = useState('lava');
  useEffect(() => {
    if (phase === 'lava' && previousPhaseRef.current === 'toLava') {
      navigationRef.current?.querySelector(`[data-section="${currentSection}"]`)?.focus();
    }
    previousPhaseRef.current = phase;
  }, [phase, currentSection]);
  const phaseRef = useRef('lava');
  const setPhaseBoth = (p) => {
    if (p === 'toLava') {
      const reverse = phaseRef.current === 'rect' && currentSection !== 3 && !!entityTransfer.current.story && !prefersReducedMotion;
      entityTransfer.current.reverse = reverse;
      entityTransfer.current.startedAt = reverse ? performance.now() : -Infinity;
      entityTransfer.current.progress = reverse ? 1 : Infinity;
      if (reverse) entityTransfer.current.ink = sampleInkTargets(entityTransfer.current.story);
      entityTransfer.current.ejectionBalls = null;
    }
    if (p === 'toRect' || p === 'lava') entityTransfer.current.reverse = false;
    phaseRef.current = p;
    setPhase(p);
  };
  const [menuHidden, setMenuHidden] = useState(false); // Track immediate menu hiding
  const [menuClicked, setMenuClicked] = useState(false); // Track when menu item is clicked for transition
  const menuFadeProgress = useRef(0);
  const menuInkCanvasRef = useRef(null);
  const menuInkCache = useRef({ phase: null, width: 0, height: 0, points: [], contentInk: undefined, destinations: [] });
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
  const perfRef = useRef(createQualityController(window.innerWidth < 768));
  const profileRef = useRef({ phase: 'lava', frames: [], mesh: [] });
  const scheduleTimeout = useManagedTimeout();
  const rectSkipRef = useRef(0); // used to skip heavy updates in stable rect
  // Camera centering progress for non-sandbox mode
  const cameraCenteringProgressRef = useRef(0);
  const cameraCenteringEnabledRef = useRef(false);
  // Camera reverse centering (back to side) for non-sandbox mode
  const cameraReverseCenteringProgressRef = useRef(0);
  const cameraReverseCenteringEnabledRef = useRef(false);
  const reverseStartPositionRef = useRef(null); // Store actual starting position for smooth reverse movement

  // Add these arrays to track previous positions for velocity-based stretching
  const [prevDirX] = useState(Array(NUM_METABALLS).fill(0));
  const [prevDirY] = useState(Array(NUM_METABALLS).fill(0));
  const [prevDirZ] = useState(Array(NUM_METABALLS).fill(0));

  // Store our marching cubes instance
  const marchingCubesRef = useRef();
  const menuReferenceDiameter = useRef(null);
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

        // Update text influence based on rectangle phase
        const textInfluence = (phaseRef.current === 'rect' || phaseRef.current === 'toRect')
          ? (phaseRef.current === 'rect' ? 1.0 : Math.max(0, (morphRef.current - 0.7) * 3.33))
          : 0.0;

        if (marchingCubesRef.current.material.uniforms.uTextInfluence) {
          marchingCubesRef.current.material.uniforms.uTextInfluence.value = textInfluence;
        }

        // Mark material as needing update
        marchingCubesRef.current.material.needsUpdate = true;

        // Update background color
        gl.setClearColor(
          new THREE.Color(backgroundColor.r, backgroundColor.g, backgroundColor.b),
          1.0
        );


      } else {
        console.warn("Material not ready for uniform updates");
      }
    } catch (error) {
      console.error("Error updating material colors:", error);
    }
  }, [baseColor, highlightColor, backgroundColor]);

  useBlobTimeline(phaseRef, morphRef, entityTransfer, prefersReducedMotion, simRef);
  const applySlices = useBlobSlicing(marchingCubesRef, phaseRef, prefersReducedMotion, simRef);

  // Animate menu fade progress for smooth transitions - simplified
  useEffect(() => {
    if (!menuClicked) {
      menuFadeProgress.current = 0;
      return;
    }

    // Faster animation for less stuttering
    const duration = 400; // Reduced from 600ms
    const startTime = Date.now();

    let animationFrame;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      menuFadeProgress.current = progress;
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [menuClicked]);

  useFrame(() => {
    const nav = navigationRef.current;
    const canvas = menuInkCanvasRef.current;
    if (!nav || !canvas || document.hidden) return;
    const phaseNow = phaseRef.current;
    const menuPhase = phaseNow === 'lava' && sandboxMode && currentSection === 3 ? 'rect' : phaseNow;
    const state = menuInkState(menuPhase, entityTransfer.current.progress, menuClicked,
      menuFadeProgress.current, prefersReducedMotion);
    // The moving mask is the reveal; opacity here would dim each glyph twice.
    nav.style.opacity = state.exposure < .005 ? '0' : '1';
    nav.style.pointerEvents = state.exposure < .99 || phaseNow !== 'lava' ? 'none' : 'auto';
    nav.style.visibility = state.exposure < .005 ? 'hidden' : 'visible';
    nav.style.setProperty('--menu-reveal', `${state.front ?? state.exposure * 118}%`);

    const cache = menuInkCache.current;
    const width = window.innerWidth, height = window.innerHeight;
    if (cache.phase !== phaseNow || cache.width !== width || cache.height !== height) {
      const bounds = nav.getBoundingClientRect();
      const targets = sampleInkTargets(nav, '#171717');
      const points = [];
      for (let i = 0; i < targets.positions.length; i += 3) {
        points.push({ x: bounds.left + targets.positions[i], y: bounds.top + targets.positions[i + 1],
          band: targets.positions[i + 1] / Math.max(1, bounds.height), coverage: targets.coverage[i / 3], id: i / 3 });
      }
      cache.phase = phaseNow;
      cache.width = width;
      cache.height = height;
      cache.points = points;
      cache.contentInk = undefined;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (!state.active || !cache.points.length) return;
    const transfer = entityTransfer.current;
    const contentInk = targetSectionRef.current === 3 ? null : transfer.ink;
    if (cache.contentInk !== contentInk || cache.contentVersion !== contentInk?.portraitVersion || cache.contentOffsetX !== transfer.offset?.x || cache.contentOffsetY !== transfer.offset?.y) {
      cache.contentInk = contentInk;
      cache.contentVersion = contentInk?.portraitVersion;
      cache.contentOffsetX = transfer.offset?.x;
      cache.contentOffsetY = transfer.offset?.y;
      cache.destinations = visibleContentTargets(contentInk, transfer.offset, width, height);
    }
    ctx.fillStyle = '#171717';
    for (const point of cache.points) {
      const destination = cache.destinations.length
        ? cache.destinations[(point.id * 73) % cache.destinations.length]
        : { x: width * .72, y: height * .45 };
      const particle = menuInkParticle(transfer.progress, point.band,
        (destination.y - (transfer.offset?.y || 0)) / Math.max(1, contentInk?.height || height));
      if (particle.opacity < .003) continue;
      const arc = particle.arc * Math.sin(point.id * 12.9898) * 22;
      ctx.globalAlpha = particle.opacity * point.coverage;
      ctx.beginPath();
      ctx.arc(point.x + (destination.x - point.x) * particle.ease + arc,
        point.y + (destination.y - point.y) * particle.ease - arc * .55,
        1.1 - particle.ease * .35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  // In the initialization effect, improve the restoration logic
  useEffect(() => {
    let cancelled = false;
    let ownedMesh = null;
    const ownedSimulation = simRef.current;
    // Only load MarchingCubes when needed
    if (!marchingCubesRef.current) {
      import('three/examples/jsm/objects/MarchingCubes.js').then(module => {
        if (cancelled) return;
        const { MarchingCubes } = module;


        // Setup camera for side-by-side layout - position lava lamp to the left of center
        const baseCameraDistance = 25;
        const cameraDistance = Math.max(18, Math.min(35, baseCameraDistance * (1 / Math.sqrt(responsiveScale))));

        // Store the original camera distance for consistent reverse movement
        if (originalCameraDistanceRef.current === null) {
          originalCameraDistanceRef.current = cameraDistance;
        }

        // Position camera to view lava lamp on the left side of screen
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth < 1200;

        if (isMobile) {
          // Mobile: center the lava lamp, menu below
          camera.position.set(0, 0, cameraDistance);
          camera.lookAt(0, 0, 0);

        } else {
          // Desktop/Tablet: position camera to center the blob+menu "container"
          // Don't override camera position if we have active camera centering


          if (cameraCenteringProgressRef.current === 0 &&
            (cameraReverseCenteringProgressRef.current === 0 || cameraReverseCenteringProgressRef.current === 1) &&
            centeringProgressRef.current === 0 && !cameraReverseCenteringEnabledRef.current) {
            camera.position.set(3, 0, cameraDistance);  // Moved slightly toward center
            camera.lookAt(3, 0, 0);  // Look at offset position

          } else {
            // Just update Z position and lookAt without overriding smooth X movement
            camera.position.z = cameraDistance;
            // Don't override lookAt either as smooth centering handles it
            camera.updateProjectionMatrix();

          }
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

        // Keep one grid for the whole interaction: rebuilding it mid-flight
        // hitches, and the cubic cost of a 104+ grid starves animation frames.
        // Interpolated surfaces/normals retain the liquid silhouette at 72.
        const initialResolution = window.innerWidth < 768 ? 64 : 72;
        const effect = new MarchingCubes(
          initialResolution,
          lavaMaterial,
          false,
          false,
          100000
        );

        ownedMesh = effect; // MarchingCubes already supplies interpolated normals.

        // Default initial position
        effect.position.set(0, 0, 0);

        // Set responsive scale based on screen size
        const scaledSize = menuBlobScale(window.innerWidth, window.innerHeight, camera.fov, camera.position.z);

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


        // Make marchingCubesRef accessible globally for text masking
        window.marchingCubesRef = marchingCubesRef;

        // Lighting is calculated inside lavaMaterial; no scene lights needed.

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

      });
    }
    return () => {
      cancelled = true;
      if (ownedMesh) {
        ownedMesh.removeFromParent();
        ownedMesh.geometry.dispose();
        ownedMesh.material.dispose();
        if (marchingCubesRef.current === ownedMesh) marchingCubesRef.current = null;
      }
      ownedSimulation.initialized = false;
      ownedSimulation.clock.stop();
      if (window.marchingCubesRef === marchingCubesRef) delete window.marchingCubesRef;
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



    // Try to update just the material colors
    const success = updateMaterialColor(
      marchingCubesRef.current.material,
      baseColor,
      highlightColor,
      gl,
      backgroundColor
    );

    if (success) {

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

  // Colour changes update the existing material above, preserving transfer uniforms.

  // Update marching cubes scale when responsive scale changes
  useEffect(() => {
    if (marchingCubesRef.current) {
      const scaledSize = menuBlobScale(window.innerWidth, window.innerHeight, camera.fov, camera.position.z);
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
          // Don't override camera position if we have active camera centering


          if (cameraCenteringProgressRef.current === 0 &&
            cameraReverseCenteringProgressRef.current === 0 &&
            centeringProgressRef.current === 0 &&
            !cameraReverseCenteringEnabledRef.current &&
            !cameraCenteringEnabledRef.current) {
            camera.position.set(3, 0, cameraDistance);  // Moved slightly toward center
            camera.lookAt(3, 0, 0);

          } else {
            // Just update Z position without overriding smooth X movement
            camera.position.z = cameraDistance;
            camera.updateProjectionMatrix();

          }
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

      // Delay centering animation to prevent jump - longer delay for smoother transition
      scheduleTimeout(() => {


        centeringEnabledRef.current = true;
        centeringProgressRef.current = 0.001;
        // Reset starting positions so they get captured fresh
        startingPositionsRef.current = { center: null, satellites: [] };

      }, 500); // Increased delay from 100ms to 500ms for smoother transition

    } else if (!sandboxMode) {
      // Reset centering when leaving sandbox

      centeringProgressRef.current = 0;
      centeringEnabledRef.current = false;
      startingPositionsRef.current = { center: null, satellites: [] };
    }
  }, [sandboxMode, currentSection]);

  // Track which satellite blob is currently expanded into rectangle
  const expandedBlobRef = useRef(-1); // -1 means none, 0-N means that satellite index
  const satellitePositionsRef = useRef([]); // track live positions of all satellites
  const chosenBlobPosRef = useRef(new THREE.Vector3()); // Store the actual position of chosen blob

  // SIMPLIFIED: Just track blob positions for smooth transitions
  const blobTargetPositions = useRef([]); // Where each blob should go
  const blobCurrentPositions = useRef([]); // Where each blob currently is

  // ADD THIS REF - it was missing
  const hasCompletedFirstCycle = useRef(false); // Track if we've completed at least one morph cycle

  // Add ref for the rectangle mesh
  const rectangleMeshRef = useRef(null);

  // Store initial camera distance for consistent Z-axis movement
  const initialCameraDistanceRef = useRef(null);

  // Store the original camera distance on first setup to ensure reverse movement returns to exact same position
  const originalCameraDistanceRef = useRef(null);

  // Process metaballs for marching cubes - SMOOTHER CONVERGENCE
  const updateMetaballs = (effect, time, numMetaballs, strength, subtract, morph = 0, params = adjustableParams) => {
    // Reset without conditional checks
    effect.reset();

    // Use eased morph for smoother visual transitions
    const easedMorph = easeInOutCubic(morph);

    // Scale down organic dynamics as we morph - smoother transition
    const dyn = Math.max(0.1, 1.0 - easedMorph * 0.95); // Much stronger damping

    // Add new non-spherical warping frequencies - much slower for minimal chaos
    const warpFreqX = time * 0.15; // Reduced from 0.35 for very calm movement
    const warpFreqY = time * 0.12; // Reduced from 0.29
    const warpFreqZ = time * 0.18; // Reduced from 0.41

    // Asymmetric warping values - much stronger damping for very smooth convergence
    const morphDamping = 1.0 - easedMorph * 0.98; // Near-complete damping during convergence
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

    // Reduce undulation amounts during morph - smoother damping
    const calm = 1.0 - easedMorph * easedMorph; // Quadratic damping for smoother transition
    const xUndulation = 0.20 * calm * Math.sin(time * 0.24) * Math.sin(time * 0.09); // Reduced frequency and amplitude
    const yUndulation = 0.20 * calm * Math.sin(time * 0.28 + 0.5) * Math.sin(time * 0.06);
    const zUndulation = 0.20 * calm * Math.sin(time * 0.21 + 0.9) * Math.sin(time * 0.11);

    // Fixed center values
    const centerX = 0.5;
    const centerY = 0.5;
    const centerZ = 0.5;

    // High-frequency, low-amplitude jiggling offsets - much stronger damping during morph
    const jIntensity = params.jiggleIntensity * calm * calm * calm; // Cubic damping for very stable convergence
    const jiggleX = 0.01 * jIntensity * Math.sin(time * 1.2) * Math.sin(time * 1.0); // Much slower frequencies
    const jiggleY = 0.01 * jIntensity * Math.sin(time * 1.4) * Math.sin(time * 1.1);
    const jiggleZ = 0.01 * jIntensity * Math.sin(time * 1.1) * Math.sin(time * 0.9);

    // MUCH SMOOTHER CENTER BLOB - minimal undulation during convergence
    const centerUndulationX = xUndulation * 0.1 * morphDamping; // Reduced from 0.3
    const centerUndulationY = yUndulation * 0.1 * morphDamping;
    const centerUndulationZ = zUndulation * 0.1 * morphDamping;

    const dynamicCenterX = centerX + centerUndulationX + jiggleX * 0.2; // Reduced jiggle impact
    const dynamicCenterY = centerY + centerUndulationY + jiggleY * 0.2;
    const dynamicCenterZ = centerZ + centerUndulationZ + jiggleZ * 0.2;

    // Lerp center blob to exact center during morph - earlier start and smoother easing
    const centeringStart = 0.05; // Start centering earlier at 5% for smoother transition
    const adjustedMorph = Math.max(0, (easedMorph - centeringStart) / (1 - centeringStart));
    // Apply additional easing for ultra-smooth convergence
    const smoothedMorph = easeInOutCubic(adjustedMorph);
    let finalCenterX = THREE.MathUtils.lerp(dynamicCenterX, 0.5, smoothedMorph);
    const finalCenterY = THREE.MathUtils.lerp(dynamicCenterY, 0.5, smoothedMorph);
    const finalCenterZ = THREE.MathUtils.lerp(dynamicCenterZ, 0.5, smoothedMorph);

    centerRef.current.set(finalCenterX, finalCenterY, finalCenterZ);


    // A small apparent volume transfer and damped recoil make shedding read
    // as material leaving the body. This is an art-directed approximation.
    const inkProgress = entityTransfer.current.progress ?? Infinity;
    const withdrawal = Number.isFinite(inkProgress)
      ? THREE.MathUtils.smoothstep(inkProgress, .05, .27) * (1 - THREE.MathUtils.smoothstep(inkProgress, .62, 1))
      : 0;
    const centerStrength = strength * (1.7 + easedMorph * 2.0) * (1 - withdrawal * .04); // Grows stronger


    effect.addBall(finalCenterX, finalCenterY, finalCenterZ, centerStrength * dyn, subtract);

    // MUCH SMOOTHER SUPPORT BLOBS - merge into center during morph with minimal movement
    const supportCount = NUM_SUPPORT_BALLS;
    for (let i = 0; i < supportCount; i++) {
      const angle = i * 2.1 + time * 0.03 * morphDamping; // Much slower rotation, damped during convergence

      // Dynamic positions - much reduced jiggle and movement for stability
      const orbitRadius = 0.12;
      const dynamicX = centerX + Math.cos(angle) * orbitRadius * xElongation + jiggleX * (0.5 + 0.1 * Math.sin(i * 2.1)); // Much reduced
      const dynamicY = centerY + Math.sin(angle) * orbitRadius * yElongation + jiggleY * (0.5 + 0.1 * Math.cos(i * 1.7));
      const dynamicZ = centerZ + Math.sin(angle * 0.7) * orbitRadius * zElongation + jiggleZ * (0.5 + 0.1 * Math.sin(i * 1.3));

      // SMOOTHER LERP TO CENTER - earlier start and smoother easing
      const centeringStart = 0.05; // Start centering earlier at 5% for smoother transition
      const adjustedMorph = Math.max(0, (easedMorph - centeringStart) / (1 - centeringStart));
      // Apply additional easing for ultra-smooth convergence
      const smoothedMorph = easeInOutCubic(adjustedMorph);
      let px = THREE.MathUtils.lerp(dynamicX, 0.5, smoothedMorph);
      const py = THREE.MathUtils.lerp(dynamicY, 0.5, smoothedMorph);
      const pz = THREE.MathUtils.lerp(dynamicZ, 0.5, smoothedMorph);


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
      // Much more gradual motion slowdown during convergence for very smooth transition
      const motionSpeed = 0.1 * (1 - easeInOutCubic(convergePhase) * 0.98); // Very slow motion during convergence

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

        if (rectanglePhase > 0.01 && (boxW > 0.001 || boxH > 0.001)) { // Much lower thresholds for very small rectangles
          // MINIMAL FLAT RECTANGLE: Use only essential metaballs for performance
          const expansionProgress = easeInOutCubic(rectanglePhase);
          const baseStrength = strength * 0.3 * expansionProgress;

          // Small, controlled dimensions to stay within boundaries
          const rectWidth = boxW * 2.0;  // Much smaller
          const rectHeight = boxH * 2.0; // Much smaller

          // Use minimal metaballs - just corners and center points
          const cornerStrength = baseStrength * 1.2;
          const edgeStrength = baseStrength * 1.0;

          // 4 corners
          effect.addBall(rectCenterX + rectWidth * 0.5, rectCenterY + rectHeight * 0.5, rectCenterZ, cornerStrength, subtract);
          effect.addBall(rectCenterX - rectWidth * 0.5, rectCenterY + rectHeight * 0.5, rectCenterZ, cornerStrength, subtract);
          effect.addBall(rectCenterX + rectWidth * 0.5, rectCenterY - rectHeight * 0.5, rectCenterZ, cornerStrength, subtract);
          effect.addBall(rectCenterX - rectWidth * 0.5, rectCenterY - rectHeight * 0.5, rectCenterZ, cornerStrength, subtract);

          // 4 edge centers
          effect.addBall(rectCenterX + rectWidth * 0.5, rectCenterY, rectCenterZ, edgeStrength, subtract); // Right
          effect.addBall(rectCenterX - rectWidth * 0.5, rectCenterY, rectCenterZ, edgeStrength, subtract); // Left
          effect.addBall(rectCenterX, rectCenterY + rectHeight * 0.5, rectCenterZ, edgeStrength, subtract); // Top
          effect.addBall(rectCenterX, rectCenterY - rectHeight * 0.5, rectCenterZ, edgeStrength, subtract); // Bottom

          // 1 center (optional, for stability)
          effect.addBall(rectCenterX, rectCenterY, rectCenterZ, baseStrength * 0.8, subtract);
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

    // Text clipping will be handled by Three.js clipping planes instead of metaballs

    // OPTIMIZED isolation adjustment for better performance
    if (rectanglePhase > 0) {
      // More conservative isolation increase to maintain performance
      const isoProgress = easeInOutCubic(Math.max(0, (rectanglePhase - 0.3) / 0.7));
      const targetIso = adjustableParams.isolation * 1.2; // Reduced from 1.5x to 1.2x

      effect.isolation = adjustableParams.isolation * (1.0 - isoProgress) + targetIso * isoProgress;
    } else {
      effect.isolation = adjustableParams.isolation;
    }

    // Split the density volume before polygonization, including new cut faces.
    applySlices(effect);
    // Update the marching cubes mesh
    effect.update();
  };

  // Initialize accumulator in the component, before useFrame
  const simAccumulator = useRef(0);

  // Scroll to cycle sections and morph into cards - REPLACED WITH MENU NAVIGATION
  // Removed scroll-based navigation in favor of menu system

  // Add menu-based navigation handler
  const handleMenuSelection = (sectionIndex) => {


    if (wheelLockedRef.current) {

      return;
    }

    // Inside the organism, change its content without returning to the menu.
    if (phaseRef.current === 'rect' && sectionIndex !== 3) {
      if (sectionIndex !== currentSection) {
        entityTransfer.current.startedAt = -Infinity;
        entityTransfer.current.ejectionBalls = null;
        setCurrentSection(sectionIndex);
        entityChapter.current = 0;
        entityImpulse.current = 1;
      }
      return;
    }
    entityChapter.current = 0;

    const now = Date.now();
    if (now - lastWheelActionRef.current < 350) {

      return;
    }



    targetSectionRef.current = sectionIndex;
    // Immediately start the fade transition
    setMenuClicked(true);


    // Don't use setTimeout - let the phase transitions control menu visibility

    if (phaseRef.current === 'lava') {
      // Special handling for Sandbox mode (section 3) - no morphing needed
      if (sectionIndex === 3) {
        if (sandboxMode && currentSection === 3) {

          // Already in sandbox mode, clicking again should exit

          // Delay state changes to prevent jump - same as other menu options
          scheduleTimeout(() => {
            setSandboxMode(false);
            setCurrentSection(0); // Return to projects
            // Stay in lava phase

            // Use same fade timing as other sections
            scheduleTimeout(() => {
              setMenuClicked(false);
            }, 1200);
          }, 100); // Same delay as other menu options

          return;
        }



        // Follow EXACT same pattern as other menu options - single delayed state batch
        scheduleTimeout(() => {
          // Batch ALL state changes together like other menu options
          setCurrentSection(sectionIndex);
          setSandboxMode(true);
          setMenuClicked(false); // Reset menu in same batch

        }, 1200); // Same 1200ms delay as original menu fade timing

        return;
      }

      // Keep the exact mesh and camera that the visitor clicked. Its surface
      // is the transfer source and the return destination; the old rectangle
      // composition must not move it underneath the departing particles.
      if (marchingCubesRef.current) {
        const body = marchingCubesRef.current;
        body.updateMatrixWorld();
        entityTransfer.current.pose = {
          position: body.position.clone(), quaternion: body.quaternion.clone(), scale: body.scale.clone(),
          cameraPosition: camera.position.clone(), cameraQuaternion: camera.quaternion.clone(),
        };
      }
      // Start morphing to rectangle for other sections
      const randomBlob = Math.floor(Math.random() * Math.max(3, adjustableParams.numMetaballs));
      expandedBlobRef.current = randomBlob;

      // IMMEDIATELY reset sandbox centering to prevent jump
      centeringProgressRef.current = 0;
      centeringEnabledRef.current = false;

      // Reset reverse centering when starting forward centering
      cameraReverseCenteringProgressRef.current = 0;
      cameraReverseCenteringEnabledRef.current = false;
      reverseStartPositionRef.current = null; // Reset stored starting position

      // Initialize camera centering immediately (no delay) to prevent jumping
      cameraCenteringEnabledRef.current = true;
      cameraCenteringProgressRef.current = 0.001; // Start immediately with tiny progress

      targetSectionRef.current = sectionIndex;
      setCurrentSection(sectionIndex);
      setSandboxMode(false); // Ensure sandbox mode is off for other sections
      morphRef.current = 0.001;
      setScrollProgress(0);
      // One entry gesture: begin shedding while the gathering morph
      // is still underway. Content/chapter updates never restart this clock.
      entityTransfer.current.startedAt = prefersReducedMotion ? -Infinity : performance.now();
      entityTransfer.current.progress = prefersReducedMotion ? Infinity : -.1;
      entityTransfer.current.scrollTop = 0;
      setPhaseBoth('toRect');
      wheelLockedRef.current = true;
      lastWheelActionRef.current = now;

    } else if (phaseRef.current === 'rect') {

      if (sectionIndex === 3) {
        // Sandbox mode clicked from rect phase

        setCurrentSection(sectionIndex);
        setSandboxMode(true);
        setPhaseBoth('toLava'); // Return to lava first
        wheelLockedRef.current = true;
        lastWheelActionRef.current = now;
      } else if (currentSection === sectionIndex) {
        // Same section clicked - revert to lava using the proven reverse centering system

        // Reset sandbox centering
        centeringProgressRef.current = 0;
        centeringEnabledRef.current = false;

        // Initialize the proven non-sandbox reverse centering system

        cameraCenteringProgressRef.current = 0;  // FORCE forward centering to 0 immediately
        cameraCenteringEnabledRef.current = false;
        cameraReverseCenteringEnabledRef.current = true;
        cameraReverseCenteringProgressRef.current = 0.001;

        setSandboxMode(false);
        setPhaseBoth('toLava');
        wheelLockedRef.current = true;
        lastWheelActionRef.current = now;
      } else {
        // Different section clicked - switch to new section

        // IMMEDIATELY reset sandbox centering to prevent jump
        centeringProgressRef.current = 0;
        centeringEnabledRef.current = false;

        // Reset forward camera centering and initialize reverse centering

        cameraCenteringProgressRef.current = 0;  // FORCE forward centering to 0 immediately
        cameraCenteringEnabledRef.current = false;
        cameraReverseCenteringEnabledRef.current = true;
        cameraReverseCenteringProgressRef.current = 0.001;

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

  // Handle sandbox back button click
  const handleSandboxBackClick = () => {
    // Use the same logic as clicking the same section again to exit sandbox


    if (wheelLockedRef.current) {

      return;
    }

    const now = Date.now();
    if (now - lastWheelActionRef.current < 350) {

      return;
    }

    // Use the EXISTING non-sandbox reverse centering system that works perfectly
    // Reset sandbox centering
    centeringProgressRef.current = 0;
    centeringEnabledRef.current = false;

    // Initialize the proven non-sandbox reverse centering system

    cameraCenteringProgressRef.current = 0;  // FORCE forward centering to 0 immediately
    cameraCenteringEnabledRef.current = false;
    cameraReverseCenteringEnabledRef.current = true;
    cameraReverseCenteringProgressRef.current = 0.001;

    setSandboxMode(false);
    setPhaseBoth('toLava');
    wheelLockedRef.current = true;
    lastWheelActionRef.current = now;
  };

  // Add a ref to store previous metaball state for interpolation
  const prevMetaballStateRef = useRef({
    positions: [],
    strengths: [],
    time: 0
  });

  // Modified useFrame with smoother, less choppy updates
  useFrame((state, frameDelta) => {
    const delta = Math.min(frameDelta, .05);
    const sim = simRef.current;
    if (!sim.initialized) return;

    // Skip all animation when freezing
    if (sim.freezeAnimation || document.hidden) return;

    const transferState = entityTransfer.current;
    const pose = transferState.pose;
    const transferBody = marchingCubesRef.current;
    if (pose && phaseRef.current !== 'lava' && transferBody) {
      const returning = phaseRef.current === 'toLava';
      const moving = phaseRef.current === 'toRect' || returning;
      const motionDelta = moving && !prefersReducedMotion ? delta : 0;
      pose.motionElapsed = (pose.motionElapsed || 0) + motionDelta;
      sim.visualTime = (sim.visualTime || 0) + motionDelta;
      transferBody.position.copy(pose.position);
      transferBody.quaternion.copy(pose.quaternion);
      transferBody.rotateY(pose.motionElapsed * .12);
      transferBody.scale.copy(pose.scale);
      camera.position.copy(pose.cameraPosition);
      camera.quaternion.copy(pose.cameraQuaternion);
      camera.updateMatrixWorld();
      transferBody.updateMatrixWorld();
      const progress = Number.isFinite(transferState.progress) ? transferState.progress : returning ? -1 : 1;
      transferBody.visible = progress < .49;
      const uniforms = transferBody.material.uniforms;
      if (uniforms.uTransferProgress) uniforms.uTransferProgress.value = progress;
      if (uniforms.uTransferClock) uniforms.uTransferClock.value = pose.motionElapsed;
      if (uniforms.uTransferMotion) uniforms.uTransferMotion.value = prefersReducedMotion ? 0
        : returning ? THREE.MathUtils.smoothstep(progress, 0, .16) : 1;
      if (uniforms.uTime) uniforms.uTime.value = sim.visualTime;
      if (uniforms.uDetached) uniforms.uDetached.value = 0;
      if (phaseRef.current === 'toRect' && morphRef.current >= 1) {
        setPhaseBoth('rect');
        setMenuHidden(true);
        wheelLockedRef.current = false;
        hasCompletedFirstCycle.current = true;
      } else if (returning && morphRef.current <= 0) {
        transferBody.visible = true;
        if (uniforms.uTransferProgress) uniforms.uTransferProgress.value = -1;
        if (uniforms.uTransferMotion) uniforms.uTransferMotion.value = 0;
        cameraCenteringEnabledRef.current = false;
        cameraCenteringProgressRef.current = 0;
        cameraReverseCenteringEnabledRef.current = false;
        cameraReverseCenteringProgressRef.current = 0;
        transferState.pose = null;
        setPhaseBoth('lava');
        setMenuHidden(false);
        setMenuClicked(false);
        wheelLockedRef.current = false;
      }
      return;
    }
    if (transferBody) {
      if (transferBody.material.uniforms.uTransferMotion) transferBody.material.uniforms.uTransferMotion.value = 0;
      transferBody.visible = phaseRef.current === 'lava' || phaseRef.current === 'toLava';
      if (transferBody.material.uniforms.uTransferProgress) {
        transferBody.material.uniforms.uTransferProgress.value = transferBody.visible ? -1 : 1;
      }
    }

    sim.visualTime = (sim.visualTime || 0) + (prefersReducedMotion ? 0 : delta);

    // Update time uniform for shader animation
    if (marchingCubesRef.current?.material?.uniforms?.uTime) {
      const uniforms = marchingCubesRef.current.material.uniforms;
      uniforms.uTime.value = sim.visualTime;
      const extractionProgress = (entityTransfer.current.progress ?? Infinity);
      const dissolve = bodyDissolve(extractionProgress, phaseRef.current, prefersReducedMotion);
      if (uniforms.uDissolve) {
        uniforms.uDissolve.value = dissolve;
      }
      const deformationTarget = prefersReducedMotion ? 0
        : Math.sin(dissolve * Math.PI) * (0.5 + entityImpulse.current * 0.65);
      uniforms.uDetached.value = THREE.MathUtils.damp(uniforms.uDetached.value, deformationTarget, 9, delta);
      uniforms.uLiquidActive.value = THREE.MathUtils.damp(uniforms.uLiquidActive.value, 0, 12, delta);
    }
    entityImpulse.current = Math.max(0, entityImpulse.current - delta * 1.6);

    if (marchingCubesRef.current?.material?.uniforms?.uInkTransfer) {
      const transferMorph = easeInOutCubic(morphRef.current);
      const transferProgress = easeInOutCubic(Math.max(0, (transferMorph - 0.5) / 0.5));
      marchingCubesRef.current.material.uniforms.uInkTransfer.value = prefersReducedMotion
        ? 0
        : Math.pow(Math.max(0, Math.sin(Math.PI * transferProgress)), 0.55);
    }


    // Get effect reference
    const effect = marchingCubesRef.current;
    if (!effect) return;

    // SANDBOX MODE: Animate centering progress like rectangle morphing (using ref to avoid stutters)
    if (sandboxMode && currentSection === 3 && centeringEnabledRef.current) {
      const centeringSpeed = 0.8; // Much slower start for very gradual animation
      centeringProgressRef.current = Math.min(1, centeringProgressRef.current + delta * centeringSpeed);

    } else if (!sandboxMode || currentSection !== 3) {
      // Reset centering when not in sandbox mode
      if (centeringProgressRef.current > 0) {
        centeringProgressRef.current = 0;
        centeringEnabledRef.current = false;
      }
    }

    // NON-SANDBOX MODE: Animate camera centering progress (similar to sandbox mode)
    // NOW TIED TO CONVERGENCE: Use morphingProgress to drive camera centering during convergence
    if (!sandboxMode && cameraCenteringEnabledRef.current && phaseRef.current === 'toRect') {
      // Use morphingProgress directly to sync with convergence animation
      const convergenceProgress = Math.min(1, morphRef.current * 1.8); // Even faster convergence tracking for new 2.5s duration
      const centeringSpeed = 4.0; // Faster centering speed to match reduced transition time

      // Lerp towards convergence progress for smooth following
      const targetProgress = convergenceProgress;
      cameraCenteringProgressRef.current = THREE.MathUtils.lerp(
        cameraCenteringProgressRef.current,
        targetProgress,
        delta * centeringSpeed
      );


    } else if (sandboxMode || phaseRef.current === 'lava' || phaseRef.current === 'toLava') {
      // Reset camera centering when not morphing, in sandbox mode, OR during toLava phase
      cameraCenteringProgressRef.current = 0;
      cameraCenteringEnabledRef.current = false;
    }

    // NON-SANDBOX MODE: Animate reverse camera centering (back to side position)
    if (cameraReverseCenteringEnabledRef.current && phaseRef.current === 'toLava') {
      const centeringSpeed = entityTransfer.current.reverse ? 1000 / COMPOSE_DURATION : .67;
      cameraReverseCenteringProgressRef.current = Math.min(1, cameraReverseCenteringProgressRef.current + delta * centeringSpeed);

      // Enhanced debug logging


      // Stop reverse centering when it reaches 100% - but don't reset immediately
      if (cameraReverseCenteringProgressRef.current >= 1) {

        cameraReverseCenteringProgressRef.current = 1; // Keep at 1, don't reset to 0
        cameraReverseCenteringEnabledRef.current = false; // But disable the animation
        reverseStartPositionRef.current = null; // Reset stored starting position when complete

        // Ensure final position is exactly at side position
        if (camera && window.innerWidth >= 768) {

          camera.position.x = 5;
          camera.lookAt(5, 0, 0);
          camera.updateProjectionMatrix();
        }
      }
    } else if (phaseRef.current !== 'toLava' && phaseRef.current !== 'lava') {
      // Only reset reverse centering when starting a new transition cycle (not when just entering 'lava' phase)
      if (cameraReverseCenteringProgressRef.current !== 0 || cameraReverseCenteringEnabledRef.current) {

        cameraReverseCenteringProgressRef.current = 0;
        cameraReverseCenteringEnabledRef.current = false;
        reverseStartPositionRef.current = null; // Reset stored starting position
      }
    }

    // Current time for animation
    const currentTime = sim.visualTime;

    // Update sim.time smoothly
    sim.time += delta * sim.speed * (prefersReducedMotion ? 0 : 1);

    // Apply eased morph value and calculate rectangle phase once
    const easedMorph = easeInOutCubic(morphRef.current);
    // Calculate rectangle phase (when blobs should expand into rectangle) - match metaball calculation
    const rectanglePhase = Math.max(0, (easedMorph - 0.6) * 2.5); // 0.6-1.0 of morph, starts after convergence

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

      // Fixed center position for stability - prevent movement/clipping
      targetRectangleStateRef.current.centerX = 0.5;  // Always centered horizontally
      targetRectangleStateRef.current.centerY = 0.5;
      targetRectangleStateRef.current.centerZ = 0.5;  // Always centered in depth

      // The selected organism is a visual anchor rather than a text box. It
      // settles into a compact portal while the editorial content gets its own
      // readable plane in the HTML overlay.
      const breath = prefersReducedMotion ? 0 : Math.sin(currentTime * 1.2) * 0.004;
      const pressure = prefersReducedMotion ? 0 : Math.sin(entityImpulse.current * Math.PI) * 0.025;
      const chapterShape = entityChapter.current === 1 ? 0.012 : entityChapter.current === 2 ? -0.009 : 0;
      const sectionShape = currentSection === 1 ? [0.045, 0.095] : currentSection === 2 ? [0.1, 0.038] : currentSection === 4 ? [0.042, 0.042] : [0.078, 0.062];
      targetRectangleStateRef.current.width = (sectionShape[0] + breath + pressure + chapterShape) * expandT;
      targetRectangleStateRef.current.height = (sectionShape[1] - breath - pressure * 0.5 - chapterShape * 0.5) * expandT;
      targetRectangleStateRef.current.depth = (isMobileView ? 0.012 : 0.01) * expandT;

      // Debug logging for expansion calculation
      if (Math.random() < 0.01) { // Log occasionally to avoid spam

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
    }

    // NON-SANDBOX MODE: Camera positioning for rectangles (moved outside easedMorph block like sandbox)
    if (!sandboxMode && cameraCenteringProgressRef.current > 0 && !cameraReverseCenteringEnabledRef.current) {
      const isMobileView = window.innerWidth < 768;
      // Debug logging disabled to reduce console spam
      // console.log(`🎥 CAMERA CHECK: sandboxMode=${sandboxMode}, centeringProgress=${cameraCenteringProgressRef.current.toFixed(3)}, reverseEnabled=${cameraReverseCenteringEnabledRef.current}, isMobile=${isMobileView}`);

      if (!isMobileView && camera) {
        // console.log(`🎯 CAMERA CENTERING ACTIVE: progress=${cameraCenteringProgressRef.current.toFixed(3)}`);

        // Use gradual progress like sandbox mode instead of sudden easedMorph calculation
        const sideX = 5;  // Starting side position (match initial camera setup!)
        const targetX = 0; // Target position to look at
        const easedProgress = easeInOutCubic(cameraCenteringProgressRef.current); // Apply easing like sandbox

        // Use same pattern as sandbox mode - lerp from fixed positions
        const currentX = THREE.MathUtils.lerp(sideX, targetX, easedProgress);

        // MOVE CAMERA CLOSER in two phases:
        // Phase 1: Slight closer during convergence (0-60% of morph)
        // Phase 2: Much closer during rectangle formation (60-100% of morph)
        const baseCameraDistance = 25;
        const responsiveScale = Math.min(window.innerWidth / 1200, window.innerHeight / 800);
        const normalZ = Math.max(18, Math.min(35, baseCameraDistance * (1 / Math.sqrt(responsiveScale))));

        const convergencePhase = Math.min(1, morphRef.current * 1.67); // 0-60% of full transition
        const rectanglePhase = Math.max(0, (morphRef.current - 0.6) * 2.5); // 60-100% of full transition

        let targetZ;
        if (convergencePhase < 1) {
          // Phase 1: Move slightly closer during convergence with smooth easing
          const slightlyCloserZ = normalZ * 0.9; // 10% closer during convergence
          const easedConvergence = easeInOutCubic(convergencePhase); // Add smooth easing
          targetZ = THREE.MathUtils.lerp(normalZ, slightlyCloserZ, easedConvergence);
        } else {
          // Phase 2: Move much closer during rectangle formation with smooth easing
          const slightlyCloserZ = normalZ * 0.9;
          const muchCloserZ = normalZ * 0.6; // 40% closer for rectangle
          const easedRectangle = easeInOutCubic(rectanglePhase); // Add smooth easing
          targetZ = THREE.MathUtils.lerp(slightlyCloserZ, muchCloserZ, easedRectangle);
        }

        // Smoothly interpolate camera position with faster Z movement
        const lerpSpeedX = delta * 3; // Keep X-axis at original speed
        const lerpSpeedZ = delta * 10; // Very fast Z movement
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, currentX, lerpSpeedX);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, lerpSpeedZ);
        camera.lookAt(currentX, 0, 0);
        camera.updateProjectionMatrix();

        // Enhanced debug logging for Z movement (disabled to reduce spam)
        /*if (Math.random() < 0.01) { // Log more frequently to debug
          console.log(`🎯 CAMERA Z MOVEMENT: progress=${cameraCenteringProgressRef.current.toFixed(3)}, easedProgress=${easedProgress.toFixed(3)}, normalZ=${normalZ.toFixed(1)}, targetZ=${targetZ.toFixed(1)}, actualZ=${camera.position.z.toFixed(1)}`);
        }*/
      }
    }

    // REVERSE CAMERA POSITIONING: Move camera from center back to side position
    if (cameraReverseCenteringProgressRef.current > 0) {
      const isMobileView = window.innerWidth < 768;
      if (!isMobileView && camera) {
        // Store actual starting position when reverse movement begins
        if (cameraReverseCenteringProgressRef.current <= 0.001 && !reverseStartPositionRef.current) {
          reverseStartPositionRef.current = {
            x: camera.position.x,
            z: camera.position.z
          };
        }

        // Use actual starting position instead of assuming center
        const startX = reverseStartPositionRef.current?.x || 0;  // Use actual starting position
        const startZ = reverseStartPositionRef.current?.z || (originalCameraDistanceRef.current * 0.6 || 15);
        const targetX = 5;    // Target side position
        const targetZDistance = originalCameraDistanceRef.current || 25; // Target original distance

        const easedProgress = easeInOutCubic(cameraReverseCenteringProgressRef.current); // Apply easing

        // Lerp from actual starting position back to side
        const currentX = THREE.MathUtils.lerp(startX, targetX, easedProgress);
        const currentZ = THREE.MathUtils.lerp(startZ, targetZDistance, easedProgress);

        // Use direct positioning instead of lerp to avoid conflicts with camera setup effects
        camera.position.x = currentX;
        camera.position.z = currentZ;

        camera.lookAt(currentX, 0, 0);
        camera.updateProjectionMatrix();

        // Enhanced debug logging

      }
    }

    // SANDBOX MODE: Camera positioning to center the lava lamp
    if (sandboxMode && currentSection === 3 && centeringProgressRef.current > 0) {
      const isMobileView = window.innerWidth < 768;
      if (!isMobileView && camera) {
        // Similar to rectangle centering - smoothly move camera to center position
        const sideX = 5;  // Starting side position (match initial camera setup!)
        const targetX = 0; // Target center position
        const rawProgress = centeringProgressRef.current; // Raw linear progress
        const easedProgress = easeInOutCubic(rawProgress); // Apply easing
        const currentX = THREE.MathUtils.lerp(sideX, targetX, easedProgress);

        // Smoothly interpolate camera position
        const lerpSpeed = delta * 3; // Slightly faster than rectangle mode
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, currentX, lerpSpeed);
        camera.lookAt(currentX, 0, 0);
        camera.updateProjectionMatrix();


      }
    }

    // Mobile selected-state composition: bring the organism closer and lift it
    // above the exact viewport midpoint. The HTML content is projected from the
    // same origin, so the copy and surface remain locked together.
    const isMobileComposition = window.innerWidth < 768;
    if (isMobileComposition && camera && !sandboxMode) {
      const mobileProgress = easeInOutCubic(easedMorph);
      const baseCameraDistance = 25;
      const normalMobileZ = Math.max(18, Math.min(35, baseCameraDistance * (1 / Math.sqrt(responsiveScale))));
      const selectedMobileZ = normalMobileZ * 0.88;
      const selectedMobileY = -1.35;
      const cameraLerp = Math.min(1, delta * 2.8);
      const targetCameraY = THREE.MathUtils.lerp(0, selectedMobileY, mobileProgress);
      const targetCameraZ = THREE.MathUtils.lerp(normalMobileZ, selectedMobileZ, mobileProgress);

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, cameraLerp);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCameraY, cameraLerp);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCameraZ, cameraLerp);
      camera.lookAt(0, targetCameraY, 0);
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

      // Ensure camera is at correct side position when truly in lava state
      // Only when no camera animations are running
      const isMobileView = window.innerWidth < 768;
      if (!isMobileView && camera && !sandboxMode &&
          cameraCenteringProgressRef.current === 0 &&
          cameraReverseCenteringProgressRef.current === 0 &&
          centeringProgressRef.current === 0 && !cameraReverseCenteringEnabledRef.current &&
          !cameraCenteringEnabledRef.current) {
        // Only set position if camera is not already at the correct position
        if (Math.abs(camera.position.x - 5) > 0.1) {


          camera.position.x = 5;
          camera.lookAt(5, 0, 0);
          camera.updateProjectionMatrix();
        }
      }
    }

    // Smoother position drift - reduce drift when rectangle is forming
    // Apply gradual drift reduction to prevent sudden jumps when morphing starts
    const morphingStarted = easedMorph > 0;
    const driftFactor = morphingStarted ? Math.max(0.1, (1.0 - easedMorph)) : 1.0; // Never go below 10% drift
    const drift = driftFactor * 0.5; // Reduce drift magnitude
    const driftSpeed = 0.15; // Slower drift
    const driftReduction = rectanglePhase > 0 ? (1 - rectanglePhase * 0.8) : 1; // Reduce drift when rectangle forms

    const selectedOrganismOffsetX = window.innerWidth < 768
      ? 0
      : THREE.MathUtils.lerp(0, -3.1, easedMorph);
    effect.position.x = selectedOrganismOffsetX + Math.sin(currentTime * driftSpeed) * 0.05 * drift * driftReduction;
    effect.position.y = Math.sin(currentTime * driftSpeed * 0.5) * 0.025 * drift * driftReduction;
    effect.position.z = Math.sin(currentTime * driftSpeed * 0.85) * 0.05 * drift * driftReduction;

    // Fit the living display to the same viewport coordinates as its content.
    // Use camera geometry so portrait and wide screens retain the composition.
    if (!sandboxMode && (window.innerWidth >= 768 || phaseRef.current === 'lava')) {
      camera.position.y = 0;
      camera.lookAt(camera.position.x, 0, 0);
    }
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const viewWidth = viewHeight * camera.aspect;
    if (!sandboxMode && phaseRef.current === 'lava') {
      // Position in viewport space; a fixed world-space camera offset clipped
      // the blob in tall split panes, even when its height fit the screen.
      const layout = menuLayout(window.innerWidth, window.innerHeight);
      effect.position.x = camera.position.x + viewWidth * (layout.blobX / window.innerWidth - .5);
      effect.position.y = camera.position.y + viewHeight * (.5 - layout.blobY / window.innerHeight);
      const nav = navigationRef.current;
      if (nav) {
        nav.style.setProperty('--menu-left', `${layout.menuLeft}px`);
        nav.style.setProperty('--menu-top', `${layout.centerY}px`);
        nav.style.setProperty('--menu-width', `${layout.menuWidth}px`);
      }
    }
    const selectedScale = (window.innerWidth < 768 ? viewWidth * 0.61 : Math.min(viewWidth * 0.39, viewHeight * 0.59)) / 0.85;
    const baseScale = CONTAINER_RADIUS * 2.2 * responsiveScale;
    const normalScale = sandboxMode ? baseScale : menuBlobScale(window.innerWidth, window.innerHeight, camera.fov, camera.position.z, menuReferenceDiameter.current || 1);
    const selectedBlend = easeInOutCubic(easedMorph);
    effect.scale.setScalar(THREE.MathUtils.lerp(normalScale, selectedScale, selectedBlend));
    const displayX = window.innerWidth < 768 ? camera.position.x : camera.position.x - viewWidth * .215;
    const displayY = window.innerWidth < 768 ? camera.position.y + viewHeight * 0.21 : camera.position.y;
    effect.position.x = THREE.MathUtils.lerp(effect.position.x, displayX, selectedBlend);
    effect.position.y = THREE.MathUtils.lerp(effect.position.y, displayY, selectedBlend);
    effect.position.y += (entityTransfer.current.scrollTop || 0) * viewHeight / window.innerHeight * selectedBlend;
    if (!prefersReducedMotion) {
      effect.position.x += entityPointer.current.x * 0.18 * selectedBlend;
      effect.position.y -= entityPointer.current.y * 0.12 * selectedBlend;
    }

    const inkProgress = entityTransfer.current.progress ?? Infinity;
    if (!prefersReducedMotion && inkProgress > .27 && inkProgress < 1) {
      const recoilTime = (inkProgress - .27) * 1.95;
      const recoil = Math.sin(recoilTime * 16) * Math.exp(-recoilTime * 7) * .07;
      if (window.innerWidth < 768) effect.position.y += recoil;
      else effect.position.x -= recoil;
    }

    // Smoother rotation handling
    if (easedMorph < 0.01) {
      // Lava lamp state - normal rotation
      effect.rotation.y += prefersReducedMotion ? 0 : .12 * delta;
    } else if (easedMorph > 0.99) {
      // Rectangle state - lock facing forward
      effect.rotation.y = THREE.MathUtils.damp(effect.rotation.y, 0, 6.32, delta);
      effect.rotation.x = THREE.MathUtils.damp(effect.rotation.x, 0, 6.32, delta);
      effect.rotation.z = THREE.MathUtils.damp(effect.rotation.z, 0, 6.32, delta);
    } else {
      // Transitioning - smooth interpolation to front-facing
      const rotLerp = 1 - Math.exp(-easedMorph * 3 * delta);
      effect.rotation.y = THREE.MathUtils.lerp(effect.rotation.y, 0, rotLerp);
      effect.rotation.x = THREE.MathUtils.lerp(effect.rotation.x, 0, rotLerp);
      effect.rotation.z = THREE.MathUtils.lerp(effect.rotation.z, 0, rotLerp);
    }

    // BALANCED MORPHING PROGRESSION - faster convergence timing
    const lavaHoldDuration = 0.2; // Reduced from 0.3

    if (phaseRef.current === 'toRect') {
      {
        const np = morphRef.current;
        if (np >= 1) {
          setPhaseBoth('rect');
          setMenuHidden(true); // Hide menu when rectangle is fully formed
          if (window.innerWidth < 768) setMenuClicked(false);
          wheelLockedRef.current = false;
          hasCompletedFirstCycle.current = true;
        }
      }
    } else if (phaseRef.current === 'toLava') {
      // ENSURE REVERSE CENTERING IS ACTIVE during toLava phase if not in sandbox mode
      // Only initialize if reverse centering hasn't been started or completed
      if (!sandboxMode && !cameraReverseCenteringEnabledRef.current && cameraReverseCenteringProgressRef.current === 0) {

        cameraCenteringProgressRef.current = 0;  // FORCE forward centering to 0 immediately
        cameraCenteringEnabledRef.current = false;
        cameraReverseCenteringEnabledRef.current = true;
        cameraReverseCenteringProgressRef.current = 0.001;
      }

      {
        const np = morphRef.current;
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
            scheduleTimeout(() => {
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

                morphRef.current = 0; // Start from true 0 instead of 0.001
                setScrollProgress(0);
                setPhaseBoth('toRect');
              }
            }, lavaHoldDuration * 1000);
          } else {
            setPhaseBoth('lava');
            cameraReverseCenteringEnabledRef.current = false;
            cameraReverseCenteringProgressRef.current = 0;
            if (window.innerWidth >= 768) {
              camera.position.x = 5;
              camera.lookAt(5, 0, 0);
            }

            setMenuHidden(false); // Show menu when returning to lava phase
            setMenuClicked(false); // Reset clicked state
            wheelLockedRef.current = false; // Unlock wheel to allow menu interactions
          }
        }
      }
    }

    // sim.time advances once above using the render delta. The second advance
    // here previously doubled motion and amplified uneven frame intervals.

    // Update simulation speed and strength from adjustable parameters
    sim.speed = adjustableParams.speed;
    sim.strength = adjustableParams.strength;

  }, -2);

  // Evaluate the field after the body transform (-2) and ejection (-1).
  useFrame((_, delta) => {
    const sim = simRef.current;
    const effect = marchingCubesRef.current;
    if (!effect || !sim.initialized || sim.freezeAnimation || document.hidden) return;
    if (entityTransfer.current.pose && phaseRef.current !== 'lava') return;
    const resolution = updateQuality(perfRef.current, delta, phaseRef.current === 'lava');
    if (resolution !== null) {
      effect.geometry.dispose();
      effect.init(resolution);
    }
    const started = performance.now();
    updateMetaballs(effect, sim.time, adjustableParams.numMetaballs,
      adjustableParams.strength, sim.subtract, morphRef.current, adjustableParams);
    if (!sandboxMode && phaseRef.current === 'lava') {
      if (menuReferenceDiameter.current === null) {
        menuReferenceDiameter.current = measureMenuReference(effect.geometry);
      }
      effect.scale.setScalar(menuBlobScale(window.innerWidth, window.innerHeight, camera.fov, camera.position.z, menuReferenceDiameter.current));
      keepBlobClearOfMenu(effect, camera, menuLayout(window.innerWidth, window.innerHeight), window.innerWidth, window.innerHeight);
    }
    sim.frameCount++;
    if (import.meta.env.DEV) {
      const profile = profileRef.current;
      if (profile.phase !== phaseRef.current) {
        if (profile.frames.length && (profile.phase === 'toRect' || profile.phase === 'toLava')) {
          const sorted = [...profile.frames].sort((a, b) => a - b);
          console.info('[Blob profile]', JSON.stringify({
            phase: profile.phase, frames: sorted.length,
            medianMs: +sorted[Math.floor(sorted.length * .5)].toFixed(1),
            p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1),
            meshMs: +(profile.mesh.reduce((a, b) => a + b, 0) / profile.mesh.length).toFixed(1),
            resolution: effect.resolution, geometries: gl.info.memory.geometries,
            textures: gl.info.memory.textures
          }));
        }
        profile.phase = phaseRef.current;
        profile.frames = []; profile.mesh = [];
      }
      if (profile.frames.length < 600) {
        profile.frames.push(delta * 1000);
        profile.mesh.push(performance.now() - started);
      }
    }
  });

  // Navigation Menu Component
  const NavigationMenu = () => {
    const layout = menuLayout(window.innerWidth, window.innerHeight);

    const menuStyle = {
      '--menu-left': `${layout.menuLeft}px`,
      '--menu-top': `${layout.centerY}px`,
      '--menu-width': `${layout.menuWidth}px`,
    };
    const hoveredIndex = hoveredSection;

    return createPortal(<>
      <nav ref={navigationRef} className="symbiote-nav" style={menuStyle} aria-label="Portfolio navigation">
        <ol>
          {portfolioSections.map((section) => {
            const isActive = currentSection === section.id && phase === 'rect';
            const isHovered = hoveredIndex === section.id;

            return (
              <li key={section.id}>
                <button
                  type="button"
                  data-section={section.id}
                  className={`${isActive ? 'is-active' : ''} ${isHovered ? 'is-hovered' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleMenuSelection(section.id)}
                  onFocus={() => setHoveredSection(section.id)}
                  onBlur={() => setHoveredSection(null)}
                  onMouseEnter={() => {
                    setHoveredSection(section.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredSection(null);
                  }}
                >
                  <span className="symbiote-nav__label">{section.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <canvas ref={menuInkCanvasRef} className="symbiote-menu-ink" aria-hidden="true" />
    </>, document.body
    );
  };


  return (
    <group>
      {currentSection !== 3 && <SuspendedFluid phase={phase} transfer={entityTransfer} reducedMotion={prefersReducedMotion} paused={simRef} baseColor={baseColor} highlightColor={highlightColor} />}
      <InkEjection transfer={entityTransfer} bodyRef={marchingCubesRef} active={phase === 'toRect' || phase === 'rect' || phase === 'toLava'} reducedMotion={prefersReducedMotion} />
      {/* OrbitControls temporarily disabled to fix camera positioning conflicts */}
      {/* {!(sandboxMode && currentSection === 3) && <OrbitControls enableZoom={false} />} */}
      <Html fullscreen>
        {NavigationMenu()}

        {/* The organism and its content share one selection state. */}
        {currentSection !== 3 && phase !== 'lava' && phase !== 'lavaHold' && (
          <EntityDisplay
            transfer={entityTransfer}
            key={currentSection}
            section={currentSection}
            phase={phase}
            opacity={entityTransfer.current.opacity ?? 0}
            onInteract={(chapter) => {
              entityTransfer.current.startedAt = -Infinity;
              entityTransfer.current.ejectionBalls = null;
              entityChapter.current = chapter;
              entityImpulse.current = 1;
            }}
            onOpenProject={() => {
              if (phaseRef.current !== 'rect') return;
              entityTransfer.current.startedAt = -Infinity;
              entityTransfer.current.ejectionBalls = null;
              entityChapter.current = 0;
              entityImpulse.current = 1;
              setCurrentSection(0);
            }}
            onPointer={(x, y) => { entityPointer.current = { x, y }; }}
            onBack={() => {
              if (phaseRef.current !== 'rect') return;
              entityPointer.current = { x: 0, y: 0 };
              setPhaseBoth('toLava');
              setMenuHidden(false);
              setMenuClicked(false);
              wheelLockedRef.current = true;
              lastWheelActionRef.current = Date.now();
            }}
          />
        )}

        {sandboxMode && currentSection === 3 && (
          <LabPanel
            params={adjustableParams}
            onChange={(param, value) => setAdjustableParams(prev => ({ ...prev, [param]: value }))}
            onPreset={setAdjustableParams}
            onBack={handleSandboxBackClick}
          />
        )}

      </Html>
    </group>
  );
};

export default LavaLampModel;
