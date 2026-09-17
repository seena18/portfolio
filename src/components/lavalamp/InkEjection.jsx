import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { INK_ARRIVAL, INK_ROW_DELAY, INK_HANDOFF, inkRevealFront } from './inkTargets';
import { sampleTransferSurface, transferRelease, TRANSFER_FIELD_GLSL } from './transferSurface';
import { deformTransferPoint, TRANSFER_MOTION_GLSL } from './transferMotion';

export default function InkEjection({ transfer, bodyRef, active, reducedMotion }) {
  const dustRef = useRef(null);
  const lastTargets = useRef(null);
  const lastPortraitVersion = useRef(-1);
  const launches = useRef(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const lastHandoff = useRef({ story: null, front: null });
  const { camera, gl } = useThree();
  const dustGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const dustMaterial = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: {
      uProgress: { value: 0 }, uViewport: { value: new THREE.Vector2() },
      uOffset: { value: new THREE.Vector2() }, uHeight: { value: 1 },
      uDpr: { value: 1 }, uSourceProjection: { value: new THREE.Matrix4() },
      uTransferLow: { value: new THREE.Vector3() }, uTransferHigh: { value: new THREE.Vector3() },
      uTransferClock: { value: 0 }, uTransferMotion: { value: 0 }, uReverse: { value: 0 },
    },
    vertexShader: `
      attribute vec3 inkColor, departure;
      attribute vec2 launch;
      attribute float coverage;
      uniform float uProgress, uHeight, uDpr;
      uniform float uTransferClock, uTransferMotion, uReverse;
      uniform mat4 uSourceProjection;
      uniform vec2 uViewport, uOffset;
      uniform vec3 uTransferLow, uTransferHigh;
      varying vec3 vColor;
      varying float vOpacity;
      ${TRANSFER_FIELD_GLSL}
      ${TRANSFER_MOTION_GLSL}
      void main() {
        float band = clamp(position.y / uHeight, 0., 1.);
        float release = transferRelease(departure, uTransferLow, uTransferHigh);
        float arrival = ${INK_ARRIVAL} + band * ${INK_ROW_DELAY};
        float t = clamp((uProgress - release) / (arrival - release), 0., 1.);
        // Zero velocity and acceleration at each end prevents a final snap.
        float ease = t * t * t * (t * (t * 6. - 15.) + 10.);
        vec3 movingDeparture = transferMotion(departure, uTransferClock, uTransferMotion);
        vec4 projected = uSourceProjection * vec4(movingDeparture, 1.);
        vec2 ndc = projected.xy / projected.w;
        // Departed ink follows its captured launch point; returning ink tracks the living surface.
        ndc = mix(ndc, launch, (1. - uReverse) * smoothstep(0., .12, t));
        vec2 source = vec2(ndc.x * .5 + .5, .5 - ndc.y * .5) * uViewport;
        vec2 target = position.xy + uOffset;
        vec2 direction = target - source;
        vec2 tangent = normalize(vec2(-direction.y, direction.x) + .0001);
        float arc = sin(t * 3.14159265);
        arc *= arc;
        // A broad shared current keeps nearby particles travelling together.
        float bend = sin(departure.y * 4. + departure.x * 2.) * 22.;
        vec2 p = mix(source, target, ease) + tangent * bend * arc;
        gl_Position = vec4(p.x / uViewport.x * 2. - 1., 1. - p.y / uViewport.y * 2., 0., 1.);
        gl_PointSize = mix(2.7, 1.2, ease) * uDpr;
        vColor = mix(vec3(.06), inkColor, smoothstep(.4, 1., t));
        float released = smoothstep(release - .014, release + .014, uProgress);
        float handoff = smoothstep(arrival - ${INK_HANDOFF}, arrival, uProgress);
        vOpacity = released * coverage * (1. - handoff);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        float edge = 1. - smoothstep(.3, .5, length(gl_PointCoord - .5));
        if (edge * vOpacity < .003) discard;
        gl_FragColor = vec4(vColor, edge * vOpacity);
      }
    `,
  }), []);

  useEffect(() => () => {
    dustGeometry.dispose();
    dustMaterial.dispose();
  }, [dustGeometry, dustMaterial]);

  // Run after the body has advanced its transfer motion.
  useFrame(() => {
    const state = transfer.current;
    if (document.hidden) return;
    const p = state.progress ?? Infinity;
    const running = active && !reducedMotion && p >= 0 && p < 1;
    const front = reducedMotion ? 125 : inkRevealFront(p);
    if (active && state.story && (lastHandoff.current.story !== state.story || lastHandoff.current.front !== front)) {
      state.story.style.setProperty('--ink-front', `${front}%`);
      lastHandoff.current = { story: state.story, front };
    }
    if (dustRef.current) dustRef.current.visible = false;
    const body = bodyRef.current;
    if (!body || !state.ink || !active || reducedMotion) return;
    body.updateMatrixWorld();
    camera.updateMatrixWorld();

    if (state.ink !== lastTargets.current) {
      const ink = state.ink;
      const surface = sampleTransferSurface(body.geometry, body.matrixWorld, camera, ink.coverage.length);
      if (!surface.points.length) return;
      dustGeometry.dispose();
      dustGeometry.setAttribute('position', new THREE.BufferAttribute(ink.positions, 3).setUsage(THREE.DynamicDrawUsage));
      dustGeometry.setAttribute('inkColor', new THREE.BufferAttribute(ink.colors, 3));
      dustGeometry.setAttribute('coverage', new THREE.BufferAttribute(ink.coverage, 1).setUsage(THREE.DynamicDrawUsage));
      dustGeometry.setAttribute('departure', new THREE.BufferAttribute(surface.points, 3));
      const launch = new THREE.BufferAttribute(new Float32Array(ink.coverage.length * 2), 2);
      launch.setUsage(THREE.DynamicDrawUsage);
      dustGeometry.setAttribute('launch', launch);
      const release = new Float32Array(ink.coverage.length);
      for (let i = 0; i < release.length; i++) {
        scratch.fromArray(surface.points, i * 3);
        release[i] = transferRelease(scratch, surface.bounds.min, surface.bounds.max);
      }
      launches.current = { release, captured: new Uint8Array(release.length) };
      dustGeometry.setDrawRange(0, ink.coverage.length);
      dustMaterial.uniforms.uTransferLow.value.copy(surface.bounds.min);
      dustMaterial.uniforms.uTransferHigh.value.copy(surface.bounds.max);
      body.material.uniforms.uTransferLow?.value.copy(surface.bounds.min);
      body.material.uniforms.uTransferHigh?.value.copy(surface.bounds.max);
      lastTargets.current = ink;
      lastPortraitVersion.current = ink.portraitVersion || 0;
    } else if ((state.ink.portraitVersion || 0) !== lastPortraitVersion.current) {
      dustGeometry.getAttribute('position').needsUpdate = true;
      dustGeometry.getAttribute('coverage').needsUpdate = true;
      lastPortraitVersion.current = state.ink.portraitVersion || 0;
    }
    if (!running) return;
    dustRef.current.visible = true;
    const uniforms = dustMaterial.uniforms;
    uniforms.uProgress.value = p;
    uniforms.uSourceProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(body.matrixWorld);
    uniforms.uTransferClock.value = body.material.uniforms.uTransferClock?.value || 0;
    uniforms.uTransferMotion.value = body.material.uniforms.uTransferMotion?.value || 0;
    uniforms.uReverse.value = state.reverse ? 1 : 0;
    if (!state.reverse && launches.current) {
      const { release, captured } = launches.current;
      const departure = dustGeometry.getAttribute('departure');
      const launch = dustGeometry.getAttribute('launch');
      let changed = false;
      for (let i = 0; i < release.length; i++) {
        if (captured[i] || p < release[i]) continue;
        scratch.fromBufferAttribute(departure, i);
        deformTransferPoint(scratch, uniforms.uTransferClock.value, uniforms.uTransferMotion.value, scratch);
        scratch.applyMatrix4(uniforms.uSourceProjection.value);
        launch.setXY(i, scratch.x, scratch.y);
        captured[i] = 1;
        changed = true;
      }
      if (changed) launch.needsUpdate = true;
    }
    uniforms.uOffset.value.set(state.offset?.x || 0, state.offset?.y || 0);
    uniforms.uViewport.value.set(window.innerWidth, window.innerHeight);
    uniforms.uHeight.value = state.ink.height;
    uniforms.uDpr.value = gl.getPixelRatio();
  }, -1);

  return <points ref={dustRef} geometry={dustGeometry} material={dustMaterial} visible={false} frustumCulled={false} renderOrder={5} />;
}
