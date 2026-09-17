import { useEffect, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { createTimeline, advanceTimeline } from './blobTimeline';

// A single, pause-aware clock owns the composition and ink reveal.
export function useBlobTimeline(phaseRef, morphRef, transfer, reducedMotion, simRef) {
  const timeline = useRef(createTimeline());
  useFrame((_, frameDelta) => {
    const state = timeline.current;
    state.morph = morphRef.current;
    advanceTimeline(state, phaseRef.current, frameDelta, reducedMotion,
      Number.isFinite(transfer.current.startedAt),
      !simRef.current.initialized || simRef.current.freezeAnimation || document.hidden);
    morphRef.current = state.morph;
    transfer.current.progress = state.ink;
    transfer.current.opacity = state.opacity;
    if (transfer.current.overlay) {
      transfer.current.overlay.style.opacity = String(state.opacity);
    }
  }, -3);
}

export function useManagedTimeout() {
  const timers = useRef(new Set());
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); }, []);
  return useCallback((callback, delay) => {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
    return timer;
  }, []);
}
