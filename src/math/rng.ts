/**
 * Seedable PRNG (sfc32). The only place randomness is created outside crypto:
 * mock test-mode seeds, mock failure rolls, and simulation.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Lowercase hex string of `bytes` random bytes. */
  hex(bytes: number): string {
    let s = '';
    for (let i = 0; i < bytes; i++) s += (this.nextU32() & 0xff).toString(16).padStart(2, '0');
    return s;
  }
}

/** Non-deterministic seed for a fresh Rng, from the platform CSPRNG. */
export function cryptoSeed(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Lowercase hex of `bytes` CSPRNG bytes (mock server seeds in normal mode). */
export function cryptoHex(bytes: number): string {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
