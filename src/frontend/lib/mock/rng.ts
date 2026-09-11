/**
 * Deterministic PRNG so mock data is identical on server render and client
 * hydration (Math.random()/Date.now() would cause hydration mismatches).
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function seededRandom(...parts: (string | number)[]): () => number {
  return mulberry32(hashSeed(parts.join("|")));
}

/** Gaussian noise via Box-Muller, driven by a seeded uniform generator. */
export function gaussian(rand: () => number, mean = 0, stdDev = 1): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}
