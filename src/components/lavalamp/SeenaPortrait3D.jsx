import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { createScreenSpaceOutline } from './seenaOutline';
import { warmPortrait } from './portraitAsset';
import { sampleInkTargets, samplePortraitPixels, updatePortraitInk } from './inkTargets';

const PORTRAIT_TUNING = { thickness: 0.5, normalThreshold: 0.026, tonalThreshold: 0.06, depthThreshold: 0.01, zoom: 1.02, elevation: 0.2, angle: -0.28, speed: 0.55, swing: 0.6 };

function disposePortrait(root) {
  const textures = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    for (const material of [object.material].flat()) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

function PortraitScene({ onReady, onError, rotating, phase, transfer }) {
  const { gl, scene, camera, invalidate, size } = useThree();
  const modelRef = useRef(null);
  const outlineRef = useRef(null);
  const extentRef = useRef(null);
  const motion = useRef({ time: 0, announced: false, snapshotAt: -Infinity });

  useEffect(() => {
    const outline = createScreenSpaceOutline(gl);
    outline.setOptions({ ...PORTRAIT_TUNING, lineColor: 'dark', finish: 'ink', only: true, stableDensity: true });
    outlineRef.current = outline;
    gl.setClearColor(0x000000, 0);
    gl.domElement.dataset.inkPortrait = 'true';
    gl.domElement.inkSnapshot = document.createElement('canvas');
    invalidate();
    return () => {
      outlineRef.current = null;
      delete gl.domElement.dataset.inkPortrait;
      delete gl.domElement.inkSnapshot;
      outline.dispose();
    };
  }, [gl, invalidate]);

  const fit = useCallback(() => {
    const extent = extentRef.current;
    if (!extent) return;
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    // Fit the complete bust, allowing room for the shoulders throughout the turn.
    const { zoom, elevation } = PORTRAIT_TUNING;
    const distance = (Math.max(extent.y / 2 / Math.tan(halfFov),
      Math.hypot(extent.x, extent.z * 0.45) / 2 / (Math.tan(halfFov) * camera.aspect)) * 1.08 + extent.z * 0.35) / zoom;
    camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate]);

  useEffect(() => {
    let active = true;
    let pivot = null;
    warmPortrait().then(bytes => new GLTFLoader().parseAsync(bytes, '/seena/')).then(({ scene: portrait }) => {
      if (!active) { disposePortrait(portrait); return; }
      const bounds = new THREE.Box3().setFromObject(portrait);
      extentRef.current = bounds.getSize(new THREE.Vector3());
      portrait.position.sub(bounds.getCenter(new THREE.Vector3()));
      pivot = new THREE.Group();
      pivot.add(portrait);
      pivot.rotation.y = PORTRAIT_TUNING.angle;
      modelRef.current = pivot;
      motion.current.announced = false;
      scene.add(pivot);
      fit();
    }).catch(() => { if (active) onError(); });
    return () => {
      active = false;
      if (pivot) { scene.remove(pivot); disposePortrait(pivot); }
      modelRef.current = null;
    };
  }, [fit, onError, scene]);

  useEffect(() => { fit(); }, [fit, size.width, size.height]);

  useFrame((_, delta) => {
    const model = modelRef.current;
    if (!outlineRef.current || !model || document.hidden) return;
    const state = motion.current;
    const now = performance.now();
    if (rotating) {
      // The transition mask changes visibility, never the portrait's motion clock.
      const pace = 1 + Math.sin(state.time * 2) * PORTRAIT_TUNING.swing * 0.25;
      state.time += Math.min(delta, 0.12) * PORTRAIT_TUNING.speed * pace;
      model.rotation.y = PORTRAIT_TUNING.angle + state.time;
    }
    outlineRef.current.render(scene, camera, [], model);

    // Refresh the portrait's particle destinations from the turning outline.
    // The particle geometry keeps its original launch points; only its live
    // arrival pixels move, so there is no still-frame handoff to the canvas.
    const transferring = phase === 'toRect' || phase === 'toLava';
    if (!state.announced || transferring || now - state.snapshotAt > 80) {
      const snapshot = gl.domElement.inkSnapshot;
      if (snapshot.width !== gl.domElement.width || snapshot.height !== gl.domElement.height) {
        snapshot.width = gl.domElement.width;
        snapshot.height = gl.domElement.height;
      }
      const context = snapshot.getContext('2d');
      context.clearRect(0, 0, snapshot.width, snapshot.height);
      context.drawImage(gl.domElement, 0, 0);
      state.snapshotAt = now;
      const story = transfer.current.story;
      if (story && transfer.current.ink?.portraitRange && transferring) {
        updatePortraitInk(transfer.current.ink, samplePortraitPixels(gl.domElement, story.getBoundingClientRect(), snapshot));
      }
    }

    if (!state.announced) {
      state.announced = true;
      if (transfer.current.story && !transfer.current.reverse && transfer.current.progress < 1) {
        transfer.current.ink = sampleInkTargets(transfer.current.story);
      }
      onReady();
    }
  }, 1);

  return null;
}

export default function SeenaPortrait3D({ phase, transfer }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const rotating = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => setFailed(true), []);

  return <figure className={`seena-portrait${ready ? ' is-ready' : ''}`} aria-label="Rotating outline portrait of Seena Abed" aria-busy={!ready && !failed}>
    {!failed && <Canvas camera={{ position: [0, 0, 2], fov: 37, near: 0.01, far: 20 }}
      dpr={[1, 1.5]} frameloop={rotating ? 'always' : 'demand'} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={1.6} />
      <hemisphereLight args={['#ffffff', '#888888', 1.5]} />
      <directionalLight position={[-2, 3, 4]} intensity={2} />
      <PortraitScene onReady={onReady} onError={onError} rotating={rotating} phase={phase} transfer={transfer} />
    </Canvas>}
    {failed && <img className="seena-portrait__fallback" src="/seena/portrait-reference.png" alt="Portrait of Seena Abed" />}
  </figure>;
}
