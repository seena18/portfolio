import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ASSET_ROOT = '/projects/meshwright/';

function pinnedTrack(track) {
  const values = Float32Array.from(track.values);
  for (let index = 3; index < values.length; index += 3) {
    values[index] = values[0];
    values[index + 2] = values[2];
  }
  return new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), Array.from(values), track.getInterpolation());
}

function travelRange(track) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < track.values.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], track.values[index + axis]);
      high[axis] = Math.max(high[axis], track.values[index + axis]);
    }
  }
  return Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
}

function playableClip(root, clip) {
  let travelBone = null;
  let largestTravel = 0;
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const node = THREE.PropertyBinding.findNode(root, parsed.nodeName);
    if (parsed.propertyName !== 'position' || !node?.isBone) continue;
    const distance = travelRange(track);
    if (distance > largestTravel) {
      largestTravel = distance;
      travelBone = node.name;
    }
  }
  const tracks = clip.tracks.flatMap((track) => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    if (parsed.propertyName === 'scale') return [];
    if (!THREE.PropertyBinding.findNode(root, parsed.nodeName)) return [];
    if (parsed.propertyName !== 'position') return [track];
    if (parsed.nodeName !== travelBone || largestTravel <= 0.005) return [];
    return [pinnedTrack(track)];
  });
  if (!tracks.length) throw new Error('The animation does not match the Dust Saint rig.');
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function disposeObject(root) {
  root?.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    for (const material of [object.material].flat()) material?.dispose();
  });
}

function fitMeshCamera(root, camera, controls) {
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const verticalHalfAngle = THREE.MathUtils.degToRad(camera.fov) / 2;
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * camera.aspect);
  const distance = Math.max(
    size.y / (2 * Math.tan(verticalHalfAngle)),
    size.x / (2 * Math.tan(horizontalHalfAngle)),
    size.z / (2 * Math.tan(horizontalHalfAngle)),
  ) * 1.45;
  camera.position.copy(center).addScaledVector(new THREE.Vector3(0.28, 0.08, 1).normalize(), distance);
  camera.lookAt(center);
  controls?.target.copy(center);
  controls?.update();
}

function Character({ mode, onReady, onError, playing }) {
  const { scene, camera, get } = useThree();
  const mixerRef = useRef(null);

  useEffect(() => {
    const loader = new FBXLoader();
    const material = mode !== 'mesh' && new THREE.MeshStandardMaterial({
      color: mode === 'rig' ? '#8f9a92' : '#c9cbc4',
      roughness: 0.85,
      metalness: 0,
      transparent: mode === 'rig',
      opacity: mode === 'rig' ? 0.34 : 1,
      depthWrite: mode !== 'rig',
      side: THREE.DoubleSide,
    });
    let alive = true;
    let root = null;
    let helper = null;
    let clipObject = null;

    async function load() {
      const body = mode === 'mesh'
        ? (await new GLTFLoader().loadAsync(`${ASSET_ROOT}generated-mesh.glb`)).scene
        : await loader.loadAsync(`${ASSET_ROOT}corrected-rig.fbx`);
      if (!alive) { disposeObject(body); return; }
      root = body;
      const box = new THREE.Box3().setFromObject(root);
      if (box.getSize(new THREE.Vector3()).y > 20) root.scale.multiplyScalar(0.01);
      box.setFromObject(root);
      root.position.y -= box.min.y;
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
        if (material) {
          for (const original of [object.material].flat()) original?.dispose();
          object.material = material;
        }
      });
      scene.add(root);

      if (mode === 'mesh') {
        fitMeshCamera(root, camera, get().controls);
        onReady();
        return;
      }

      if (mode === 'rig') {
        helper = new THREE.SkeletonHelper(root);
        helper.material.color.set('#f1eee3');
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.renderOrder = 10;
        scene.add(helper);
      }

      clipObject = await loader.loadAsync(`${ASSET_ROOT}corrected-${mode === 'rig' ? 'idle' : 'walk'}.fbx`);
      if (!alive) { disposeObject(clipObject); return; }
      const clip = clipObject.animations?.[0];
      if (!clip) throw new Error('The Dust Saint animation is missing.');
      mixerRef.current = new THREE.AnimationMixer(root);
      mixerRef.current.clipAction(playableClip(root, clip)).play();
      if (camera.aspect >= 0.6) {
        camera.position.set(0, 1.1, 3.5);
        camera.lookAt(0, 0.92, 0);
        get().controls?.update();
      }
      onReady();
    }

    load().catch((error) => { if (alive) onError(error); });
    return () => {
      alive = false;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      if (helper) { scene.remove(helper); helper.geometry.dispose(); helper.material.dispose(); }
      if (root) { scene.remove(root); disposeObject(root); }
      if (clipObject) disposeObject(clipObject);
      material?.dispose();
    };
  }, [camera, get, mode, onError, onReady, scene]);

  useFrame((_, delta) => {
    if (playing) mixerRef.current?.update(Math.min(delta, 0.05));
  });
  return null;
}

export default function MeshwrightStage3D({ mode, fallback, alt }) {
  const hostRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [activated, setActivated] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(true);
  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setActivated(true);
    }, { rootMargin: '120px' });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPlaying(!media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return <div className="mesh-pipeline__viewer" ref={hostRef} role="group" aria-label={`${alt}. Drag to rotate the 3D character.`}>
    {activated && !failed && <Canvas
      camera={{ position: [0, 1.1, mode === 'rig' ? 4.7 : 4.2], fov: 38, near: 0.01, far: 100 }}
      dpr={[1, 1.5]}
      frameloop={visible ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#303130']} />
      <ambientLight intensity={1.2} />
      <hemisphereLight args={['#ffffff', '#555b53', 1.3]} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.7} />
      <gridHelper args={[2.5, 16, '#676d66', '#454b46']} position={[0, 0.002, 0]} />
      <Character mode={mode} onReady={handleReady} onError={handleError} playing={playing} />
      <OrbitControls makeDefault target={[0, 0.92, 0]} enablePan={false} enableZoom={false} enableDamping minPolarAngle={0.25} maxPolarAngle={Math.PI * 0.7} />
    </Canvas>}
    {(!ready || failed) && <img className="mesh-pipeline__viewer-poster" src={fallback} alt="" decoding="async" />}
    {activated && !ready && !failed && <span className="mesh-pipeline__viewer-loading" role="status">Loading 3D…</span>}
    {ready && !failed && mode === 'motion' && <button className="mesh-pipeline__viewer-control" type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause walk animation' : 'Play walk animation'}>{playing ? 'Pause' : 'Play'}</button>}
    {ready && !failed && <span className="mesh-pipeline__viewer-hint">Drag to rotate</span>}
    {failed && <span className="mesh-pipeline__viewer-hint">3D preview unavailable</span>}
  </div>;
}
