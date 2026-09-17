import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applySliceField, MAX_SLICES, sampleField, SLICE_LIFETIME } from './sliceField';
import { measureSliceHalves } from './sliceDynamics';
import { isCompleteSlice } from './sliceGesture';

const EXCLUDED = 'button:not(.entity-touch), a, input, textarea, select, [contenteditable="true"], .entity-story, .entity-chapters, .lab-ui, header, footer';

export function useBlobSlicing(bodyRef, phaseRef, reducedMotion, simRef) {
  const { camera, gl } = useThree();
  const cuts = useRef([]);
  const scratch = useRef(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'blob-slice-trail';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane();
    const direction = new THREE.Vector3();
    const worldCenter = new THREE.Vector3();
    const point = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let gesture = null;
    let trail = [];
    let frame = 0;
    let suppressClickUntil = 0;
    let captureTarget = null;
    let pixelRatio = 1;
    const allowed = () => phaseRef.current === 'lava'
      && bodyRef.current && !simRef.current.freezeAnimation && !document.hidden;
    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * pixelRatio;
      canvas.height = window.innerHeight * pixelRatio;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };
    resize();

    const project = (x, y) => {
      const body = bodyRef.current;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
      body.updateMatrixWorld();
      body.getWorldPosition(worldCenter);
      camera.getWorldDirection(direction);
      plane.setFromNormalAndCoplanarPoint(direction, worldCenter);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, point)) return null;
      return body.worldToLocal(point.clone()).multiplyScalar(.5).addScalar(.5);
    };

    const pointHitsLiquid = (position, depth) => {
      const body = bodyRef.current;
      for (let d = -.85; d <= .85; d += 1 / body.size) {
        if (sampleField(body.field, body.size,
          position.x + depth.x * d,
          position.y + depth.y * d,
          position.z + depth.z * d) > body.isolation) return true;
      }
      return false;
    };

    // Return the occupied portion of a swept segment so even a fast swipe
    // that enters and exits between pointer events still counts as a crossing.
    const liquidSpan = (a, b, depth) => {
      const steps = Math.max(2, Math.ceil(a.distanceTo(b) * bodyRef.current.size * 1.5));
      let first = -1;
      let last = -1;
      const sample = new THREE.Vector3();
      for (let step = 0; step <= steps; step++) {
        const u = step / steps;
        sample.copy(a).lerp(b, u);
        if (!pointHitsLiquid(sample, depth)) continue;
        if (first < 0) first = u;
        last = u;
      }
      return first < 0 ? null : { first, last };
    };

    const paint = () => {
      const now = performance.now();
      trail = trail.filter(p => now - p.time < (reducedMotion ? 90 : 210));
      ctx.clearRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        if (a.stroke !== b.stroke) continue;
        const life = Math.max(0, 1 - (now - b.time) / (reducedMotion ? 90 : 210));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(24,24,24,${life * .22})`;
        ctx.lineWidth = 6 * life; ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${life})`;
        ctx.lineWidth = 2 * life; ctx.stroke();
      }
      frame = trail.length ? requestAnimationFrame(paint) : 0;
    };
    const commitCut = now => {
      const cut = gesture?.pendingCut;
      if (!cut) return;
      cut.startedAt = now - 16;
      cut.bornAt = now - 16;
      cut.releasedAt = now;
      cut.halves = measureSliceHalves(bodyRef.current, cut);
      cuts.current = [...cuts.current.filter(existing => now - existing.startedAt < SLICE_LIFETIME), cut].slice(-MAX_SLICES);
      gesture.pendingCut = null;
    };
    const end = () => {
      if (gesture?.dragged) suppressClickUntil = performance.now() + 350;
      if (captureTarget?.hasPointerCapture?.(gesture?.id)) captureTarget.releasePointerCapture(gesture.id);
      captureTarget = null;
      gesture = null;
      document.body.classList.remove('is-blob-slicing');
    };
    const down = event => {
      if (!event.isPrimary || event.button !== 0 || !allowed() || event.target.closest(EXCLUDED)) return;
      const start = project(event.clientX, event.clientY);
      if (!start) return;
      const inverse = new THREE.Matrix4().copy(bodyRef.current.matrixWorld).invert();
      const depth = direction.clone().transformDirection(inverse);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
        last: start, lastTime: performance.now(), depth,
        outsideArmed: !pointHitsLiquid(start, depth), pendingCut: null,
        dragged: false, stroke: performance.now() };
      captureTarget = event.target;
      // Capture only after the drag threshold; an ordinary tap remains a tap.
    };
    const move = event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      if (!allowed()) { end(); return; }
      if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 12) return;
      if (!gesture.dragged) {
        gesture.dragged = true;
        captureTarget.setPointerCapture?.(event.pointerId);
        document.body.classList.add('is-blob-slicing');
        trail.push({ x: gesture.x, y: gesture.y, time: performance.now(), stroke: gesture.stroke });
      }
      event.preventDefault();
      const current = project(event.clientX, event.clientY);
      if (!current) return;
      const now = performance.now();
      trail.push({ x: event.clientX, y: event.clientY, time: now, stroke: gesture.stroke });
      if (!frame) frame = requestAnimationFrame(paint);
      const pointerInside = pointHitsLiquid(current, gesture.depth);
      const span = liquidSpan(gesture.last, current, gesture.depth);

      if (!gesture.pendingCut && gesture.outsideArmed && span) {
        const entry = gesture.last.clone().lerp(current, span.first);
        const exit = gesture.last.clone().lerp(current, span.last);
        const tangent = current.clone().sub(gesture.last);
        if (tangent.lengthSq() > 1e-8) {
          tangent.normalize();
          const normal = tangent.clone().cross(gesture.depth).normalize();
          const distance = current.distanceTo(gesture.last);
          const speed = distance / Math.max(.016, (now - gesture.lastTime) / 1000);
          gesture.pendingCut = {
            origin: entry,
            tangent,
            normal,
            depth: gesture.depth.clone(),
            min: 0,
            max: Math.max(0, exit.clone().sub(entry).dot(tangent)),
            power: THREE.MathUtils.clamp(.75 + speed * .30, .8, 1.25),
          };
          gesture.outsideArmed = false;
        }
      }

      if (gesture.pendingCut) {
        const distance = current.clone().sub(gesture.pendingCut.origin).dot(gesture.pendingCut.tangent);
        gesture.pendingCut.min = Math.min(gesture.pendingCut.min, distance);
        gesture.pendingCut.max = Math.max(gesture.pendingCut.max, distance);
        if (isCompleteSlice(gesture.pendingCut, pointerInside)) commitCut(now);
      }
      if (!pointerInside && !gesture.pendingCut) gesture.outsideArmed = true;
      gesture.last = current;
      gesture.lastTime = now;
    };
    const click = event => {
      if (event.detail > 0 && performance.now() < suppressClickUntil && !event.target.closest(EXCLUDED)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const up = event => { if (event.pointerId === gesture?.id) end(); };
    const cancel = () => { end(); cuts.current = []; trail = []; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('click', click, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      cancel(); cancelAnimationFrame(frame); canvas.remove();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [bodyRef, camera, gl, phaseRef, reducedMotion, simRef]);

  return useCallback(effect => {
    const now = performance.now();
    // Navigation choreography owns the volume during composition/absorption.
    if (phaseRef.current !== 'lava') {
      cuts.current = [];
    }
    cuts.current = cuts.current.filter(cut => now - cut.startedAt < SLICE_LIFETIME);
    scratch.current = applySliceField(effect, cuts.current, now, scratch.current, reducedMotion);
  }, [phaseRef, reducedMotion]);
}
