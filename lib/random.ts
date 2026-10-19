export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededShuffle<T>(arr: readonly T[], seed: string | number): T[] {
  const rng = mulberry32(typeof seed === "string" ? stringToSeed(seed) : seed);
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function randomSeedString(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

const PERM_SEED_PREFIX = "perm:v1:";

export function encodePermToSeed(numbers: readonly number[]): string {
  return `${PERM_SEED_PREFIX}${numbers.join("-")}`;
}

export function tryDecodePermSeed(
  seed: string,
  expectedLength: number,
): number[] | null {
  if (!seed.startsWith(PERM_SEED_PREFIX)) return null;
  const body = seed.slice(PERM_SEED_PREFIX.length);
  if (!body) return null;
  const parts = body.split("-");
  if (parts.length !== expectedLength) return null;
  const nums: number[] = [];
  const seen = new Set<number>();
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (!Number.isInteger(n) || n < 1 || n > expectedLength) return null;
    if (seen.has(n)) return null;
    seen.add(n);
    nums.push(n);
  }
  return nums;
}

export function isPermSeed(seed: string): boolean {
  return seed.startsWith(PERM_SEED_PREFIX);
}
