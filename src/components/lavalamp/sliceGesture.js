export const MIN_SLICE_SPAN = .075;

// The geometry is changed only after the pointer has entered from outside,
// crossed enough material to be intentional, and returned outside.
export function isCompleteSlice(pendingCut, pointerInside) {
  return Boolean(pendingCut)
    && !pointerInside
    && pendingCut.max - pendingCut.min >= MIN_SLICE_SPAN;
}
