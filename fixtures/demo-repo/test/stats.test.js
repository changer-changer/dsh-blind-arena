import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, median } from '../src/stats.js';

test('mean of numbers', () => {
  assert.equal(mean([1, 2, 3]), 2);
});

test('mean of empty list throws', () => {
  assert.throws(() => mean([]), RangeError);
});

test('median odd count', () => {
  assert.equal(median([3, 1, 2]), 2);
});

test('median even count', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

// test('median of empty list throws', () => {
//   assert.throws(() => median([]), RangeError);
// });
