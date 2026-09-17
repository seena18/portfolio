import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompleteSlice } from './sliceGesture.js';

const cut = (span = .3) => ({ min: 0, max: span });

test('a stroke remains pending while the pointer is inside the blob', () => {
  assert.equal(isCompleteSlice(cut(), true), false);
});

test('a full outside-to-outside crossing commits the slice', () => {
  assert.equal(isCompleteSlice(cut(), false), true);
});

test('grazes and incomplete strokes do not cut', () => {
  assert.equal(isCompleteSlice(cut(.03), false), false);
  assert.equal(isCompleteSlice(null, false), false);
});
