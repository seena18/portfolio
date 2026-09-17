import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createLavaLampMaterial } from './lavaMaterial';
import { FLUID_REMNANTS, fluidDensity, fluidPresence, motePosition, remnantPosition } from './fluidResidueMotion';

export default function SuspendedFluid({ phase, transfer, reducedMotion, paused, baseColor, highlightColor }) {
  const { camera, gl, size } = useThree();
  const group = useRef(null);
  const clock = useRef(0);
  const pointer = useRef(new THREE.Vector2(-2, -2));
  const smoothPointer = useRef(new THREE.Vector2(-2, -2));
  const origin = useMemo(() => new THREE.Vector3(), []);
  const active = phase === 'toRect' || phase === 'rect' || phase === 'toLava';
  const remnants = useMemo(() => FLUID_REMNANTS.map(() => {
    const material = createLavaLampMaterial(new THREE.Color('#171717'), new THREE.Color('#626262'));
    material.depthWrite = false;
    material.depthTest = false;
    material.uniforms.uLiquidActive.value = 1;
    // Small lobes occupied only a handful of cells at 24³, exposing flat edges.
    // Keep the scalar-field normals and resolve the actual curved silhouette.
    const mesh = new MarchingCubes(56, material, false, false, 12000);
    mesh.isolation = 70;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }), []);
  const motes = useMemo(() => {
    const count = fluidDensity(5120).motes;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const point = motePosition(i);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.depth;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      uniforms: {
        uTime: { value: 0 }, uPresence: { value: 0 }, uDpr: { value: 1 },
        uSize: { value: new THREE.Vector2() }, uPointer: { value: new THREE.Vector2(-2, -2) },
      },
      vertexShader: `
        uniform float uTime, uPresence, uDpr;
        uniform vec2 uSize, uPointer;
        varying float vAlpha;
        void main() {
          float depth = position.z;
          vec2 p = position.xy;
          // Out-of-phase currents let each mote drift both ways without an
          // upward wrap seam or a synchronized particle-field motion.
          p.x += sin(uTime * (.14 + depth * .13) + depth * 23. + position.y * 9.) * (.012 + depth * .016);
          p.x += sin(uTime * .37 + depth * 47.) * .006;
          p.y += cos(uTime * (.11 + depth * .12) + depth * 29. + position.x * 7.) * (.017 + depth * .021);
          p.y += sin(uTime * .29 + depth * 61.) * .007;
          vec2 delta = (p - uPointer) * vec2(uSize.x / uSize.y, 1.);
          float distanceToPointer = length(delta);
          p += normalize(delta + .0001) * .018 * exp(-distanceToPointer * 15.);
          // The reading column stays quieter than the margins; these are
          // individual points, not more of the large liquid remnants.
          float margin = smoothstep(.16, .36, abs(p.x - .5));
          vAlpha = uPresence * mix(.18, .46, margin) * (.75 + depth * .25);
          gl_PointSize = mix(1.4, 3.2, depth) * uDpr;
          gl_Position = vec4(p.x * 2. - 1., 1. - p.y * 2., 0., 1.);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float radius = length(gl_PointCoord - .5);
          float edge = 1. - smoothstep(.3, .5, radius);
          float core = 1. - smoothstep(.08, .34, radius);
          gl_FragColor = vec4(vec3(.09), vAlpha * (edge * .4 + core * .6));
        }
      `,
    });
    return { geometry, material };
  }, []);

  useEffect(() => {
    for (const mesh of remnants) {
      mesh.material.uniforms.uBaseColor.value.set(baseColor.r, baseColor.g, baseColor.b);
      mesh.material.uniforms.uHighlightColor.value.set(highlightColor.r, highlightColor.g, highlightColor.b);
    }
  }, [baseColor, highlightColor, remnants]);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const move = (event) => {
      if (event.pointerType === 'touch') return;
      pointer.current.set(event.clientX / window.innerWidth, event.clientY / window.innerHeight);
    };
    const leave = () => pointer.current.set(-2, -2);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
    };
  }, [active, reducedMotion]);

  useEffect(() => () => {
    for (const mesh of remnants) { mesh.geometry.dispose(); mesh.material.dispose(); }
    motes.geometry.dispose();
    motes.material.dispose();
  }, [remnants, motes]);

  useFrame((_, frameDelta) => {
    if (!group.current) return;
    const presence = fluidPresence(phase, transfer.current.progress, reducedMotion);
    group.current.visible = active && presence > .001;
    if (!active || presence <= .001 || document.hidden || paused.current.freezeAnimation) return;
    const delta = Math.min(frameDelta, .05);
    if (!reducedMotion) clock.current += delta;
    const time = clock.current;
    smoothPointer.current.lerp(pointer.current, 1 - Math.exp(-delta * 2.5));
    camera.updateMatrixWorld();
    const source = transfer.current.pose?.position;
    if (source) origin.copy(source).project(camera); else origin.set(0, 0, 0).project(camera);
    const sourceX = (origin.x * .5 + .5) * size.width;
    const sourceY = (.5 - origin.y * .5) * size.height;
    // Unproject to the captured body's depth, so camera changes cannot stretch the remnants.
    const depth = origin.z;
    const spread = THREE.MathUtils.smoothstep(presence, 0, 1);
    const density = fluidDensity(size.width);
    for (let i = 0; i < remnants.length; i++) {
      const mesh = remnants[i];
      mesh.visible = i < density.remnants;
      if (!mesh.visible) continue;
      const config = FLUID_REMNANTS[i];
      const p = remnantPosition(config, time, size.width, size.height, transfer.current.contentBounds);
      const x = THREE.MathUtils.lerp(sourceX, p.x, spread);
      const y = THREE.MathUtils.lerp(sourceY, p.y, spread);
      mesh.position.set(x / size.width * 2 - 1, 1 - y / size.height * 2, depth).unproject(camera);
      const radius = Math.min(config.radius, size.width * .043, density.radiusCap);
      origin.set((x + radius) / size.width * 2 - 1, 1 - y / size.height * 2, depth).unproject(camera);
      mesh.scale.setScalar(origin.distanceTo(mesh.position) * 2.7 * (.45 + .55 * presence));
      mesh.quaternion.copy(camera.quaternion);
      mesh.rotateY(time * .12 + config.seed);
      mesh.rotateZ(Math.sin(time * .21 + config.seed) * .14);
      mesh.material.uniforms.uOpacity.value = presence * density.opacity;
      mesh.material.uniforms.uLiquidHead.value.copy(mesh.position);
      mesh.reset();
      const t = time * .48 + config.seed;
      // A shared scalar field lets the smaller lobe pinch off and rejoin the body.
      mesh.addBall(.5, .47, .5, .64, 12);
      mesh.addBall(.5 + Math.sin(t * .9) * .055, .57 + Math.sin(t) * .11, .5, .28, 12);
      mesh.addBall(.52, .36 - Math.sin(t) * .045, .5 + Math.cos(t) * .035, .17, 12);
      mesh.update();
    }
    const uniforms = motes.material.uniforms;
    motes.geometry.setDrawRange(0, density.motes);
    uniforms.uTime.value = time;
    uniforms.uPresence.value = reducedMotion ? 0 : presence;
    uniforms.uDpr.value = gl.getPixelRatio();
    uniforms.uSize.value.set(size.width, size.height);
    uniforms.uPointer.value.copy(smoothPointer.current);
  }, -.5);

  return <group ref={group} visible={false}>
    {remnants.map((mesh, i) => <primitive key={i} object={mesh} />)}
    <points geometry={motes.geometry} material={motes.material} frustumCulled={false} renderOrder={3} />
  </group>;
}
