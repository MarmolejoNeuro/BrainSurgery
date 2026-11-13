/** Small, dependency-free seeded noise helpers for procedural anatomy. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 3D value noise in [0, 1]. */
export function valueNoise3(x: number, y: number, z: number, seed = 1): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

/** Fractal (fBm) value noise in roughly [0, 1]. */
export function fbm3(x: number, y: number, z: number, octaves = 4, seed = 1): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * Sulcus field: ~1 along thin meandering lines (iso-contours of noise), 0 elsewhere.
 * Two scales of contour lines give a convincing gyral/sulcal pattern.
 */
export function sulcusField(x: number, y: number, z: number, scale: number, seed = 3): number {
  const n1 = fbm3(x * scale, y * scale, z * scale, 3, seed);
  const n2 = fbm3(x * scale * 1.9 + 11, y * scale * 1.9, z * scale * 1.9, 2, seed + 50);
  const s1 = Math.exp(-Math.pow((n1 - 0.5) / 0.035, 2));
  const s2 = Math.exp(-Math.pow((n2 - 0.5) / 0.03, 2)) * 0.55;
  return Math.min(1, s1 + s2);
}
