export interface Rng {
  nextUint32(): number;
  nextFloat(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(values: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  const nextUint32 = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0);
  };

  return {
    nextUint32,
    nextFloat: () => nextUint32() / 0x100000000,
    int: (minInclusive, maxInclusive) => {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
        throw new Error("rng.int bounds must be integers");
      }
      if (maxInclusive < minInclusive) {
        throw new Error("rng.int max must be >= min");
      }
      const span = maxInclusive - minInclusive + 1;
      return minInclusive + (nextUint32() % span);
    },
    pick: <T>(values: readonly T[]): T => {
      if (values.length === 0) throw new Error("cannot pick from an empty array");
      return values[nextUint32() % values.length] as T;
    }
  };
}

export function hashSeed(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}
