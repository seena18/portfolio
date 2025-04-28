import React, { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats, Environment } from '@react-three/drei';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import * as THREE from 'three';

// Simulation constants
const CONTAINER_HEIGHT = 12;
const CONTAINER_RADIUS = 3;
const BUFFER_ZONE = 0.2;

// Reduce complexity of these key performance parameters
const RESOLUTION = 128;
const NUM_METABALLS = 6;
const NUM_SUPPORT_BALLS = 3;
const NUM_FREE_PARTICLES = 2;

// Keep the improved metaball parameters
const ISOLATION = 80;

// Add these constants for controlling non-spherical nature
const ASYMMETRY_FACTOR = 2 // Increased from 0.7
const INTERNAL_WARP_STRENGTH = 3; // Increased from 0.5

// Add these new constants for more shape control
const ELONGATION_FACTOR = 3; // Controls how stretched metaballs can become
const SHAPE_COMPLEXITY =1; // Controls how many sub-balls make up each metaball
const DISTORTION_AMOUNT =.15; // Controls spacing between sub-balls

// Add this new constant for controlling jiggling intensity
const JIGGLE_INTENSITY = 1.0; // Adjust this value to increase/decrease overall jiggling

const LavaLampModel = ({ portfolioData }) => {
  const { camera, gl, scene } = useThree();
  const [stats, setStats] = useState({ fps: 0 });

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
    speed: 0.1,
    strength: 2, // INCREASED from 0.8 for stronger connections
    subtract: 40, // REDUCED from 11 to make connections stronger
    baseTemp: 0.1,
    cycleSpeed: 0.04,
    // Rest of your configuration stays the same
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

  // Initialize once
  useEffect(() => {
    const sim = simRef.current;
    if (sim.initialized) return;

    console.log("Initializing lava lamp with marching cubes");

    // Setup camera at fixed maximum distance
    camera.position.set(0, 0, 20); // Set to maximum distance
    camera.lookAt(0, 0, 0);

    // Setup renderer
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    // Create marching cubes material - BLACK metaballs
    const lavaMaterial = new THREE.MeshStandardMaterial({  // Using MeshStandardMaterial instead of MeshPhysicalMaterial
      color: new THREE.Color('#000000'),
      emissive: new THREE.Color('#000000'),
      emissiveIntensity: 0.05,
      metalness: .6,      // In the useFrame function, balance movement amplitudes:

      roughness: .9,       // Increased from 0.3 to create matte finish
    });

    // Create marching cubes instance with improved parameters
    const effect = new MarchingCubes(
      RESOLUTION,
      lavaMaterial,
      false,
      false,
      100000
    );
    effect.position.set(0, 0, 0);

    // Increase the scale further to give more room
    effect.scale.set(
      CONTAINER_RADIUS * 2.0, // Increased from 1.8
      CONTAINER_RADIUS * 2.0, // Increased from 1.8
      CONTAINER_RADIUS * 2.0  // Increased from 1.8
    );

    effect.enableUvs = false;
    effect.enableColors = false;
    effect.isolation = ISOLATION;

    scene.add(effect);
    marchingCubesRef.current = effect;

    // Create lighting - modified for black metaballs on white background
    createLighting(scene);

    // Randomize initial positions of satellite metaballs
    for (let i = 0; i < NUM_METABALLS; i++) {
      // Random initial positions within safe bounds
      prevDirX[i] = (Math.random() * 0.4 - 0.2);
      prevDirY[i] = (Math.random() * 0.4 - 0.2);
      prevDirZ[i] = (Math.random() * 0.4 - 0.2);
    }

    // Start simulation with random initial state
    sim.clock.start();
    sim.initialized = true;

    return () => {
      if (marchingCubesRef.current) {
        scene.remove(marchingCubesRef.current);
      }
    };
  }, [camera, gl, scene]);

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
  };

  // Process metaballs for marching cubes - OPTIMIZED
  const updateMetaballs = (effect, time, numMetaballs, strength, subtract) => {
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
      const internalWarpPhase = time * 1.2 + i * 1.7;
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
      if (lifecycleBase < 1.8) { // INCREASED from 1.2 - more time connected
        // Phase 1: moving outward but still connected
        radius = 0.12 + (lifecycleBase * 0.15); // Reduced expansion rate from 0.18
        ballStrength = strength * (0.9 - lifecycleBase * 0.25); // Increased from 0.85, reduced falloff
      }
      else if (lifecycleBase < 2.4) { // REDUCED from 2.8 - less time separated
        // Phase 2: brief separation 
        radius = 0.3; // Reduced from 0.32 - stays closer to center
        ballStrength = strength * 0.55; // INCREASED from 0.42 - stronger connection
      }
      else {
        // Phase 3: moving inward - faster reconnection
        const fallProgress = (lifecycleBase - 2.4) / 1.6; // Adjusted for new phase lengths
        radius = 0.3 - fallProgress * 0.18; // Adjusted to match new radius
        ballStrength = strength * (0.55 + fallProgress * 0.35); // Adjusted for new strength
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

    // Update the marching cubes mesh
    effect.update();
  };

  // Animation with useFrame
  useFrame((state, delta) => {
    const sim = simRef.current;
    if (!sim.initialized) return;

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

  return (
    <>
      <Stats />
      <OrbitControls
        enableZoom={false} // Disable zoom completely
        enablePan={true}
        minDistance={20} // Set to maximum distance
        maxDistance={20} // Set to maximum distance (same as min to lock it)
        enableDamping={true}
        dampingFactor={0.05}
      />
      <Environment preset="studio" intensity={0.3} />
    </>
  );
};

export default LavaLampModel;