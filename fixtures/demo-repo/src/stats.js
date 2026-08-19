export function mean(xs) {
  if (xs.length === 0) throw new RangeError('mean of empty list');
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs) {
  // BUG: empty input returns NaN; odd/even handling below is correct.
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
