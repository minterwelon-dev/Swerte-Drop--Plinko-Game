import { analyticalBin, multiplierFor } from './drop';
import type { MultiplierX100, Risk, Rows } from './config';

// Protocol (fixed, see AGENTS.md): HMAC-SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}`),
// both UTF-8 encoded strings. Bit i = (bytes[i >> 3] >> (i & 7)) & 1, 0 = left, 1 = right.
const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const k = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', k, encoder.encode(message)));
}

/** Path of `rows` moves from HMAC bytes. */
export function pathFromBytes(bytes: Uint8Array, rows: number): number[] {
  const path: number[] = [];
  for (let i = 0; i < rows; i++) path.push((bytes[i >> 3] >> (i & 7)) & 1);
  return path;
}

export async function derivePath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: Rows,
): Promise<number[]> {
  return pathFromBytes(await hmacSha256(serverSeed, `${clientSeed}:${nonce}`), rows);
}

export interface VerifyResult {
  serverSeedHash: string;
  path: number[];
  bin: number;
  multiplierX100: MultiplierX100;
}

/** Recompute a round from its public inputs (used by the verify modal and tests). */
export async function verifyRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: Rows,
  risk: Risk,
): Promise<VerifyResult> {
  const path = await derivePath(serverSeed, clientSeed, nonce, rows);
  const bin = analyticalBin(path);
  return {
    serverSeedHash: await sha256Hex(serverSeed),
    path,
    bin,
    multiplierX100: multiplierFor(rows, risk, bin),
  };
}
