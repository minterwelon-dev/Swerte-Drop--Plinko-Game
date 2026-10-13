import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { derivePath, hmacSha256, pathFromBytes, sha256Hex, verifyRound } from '../src/math/fair';
import { MULTIPLIERS } from '../src/math/multipliers';

const serverSeed = 'a3f1c0de'.repeat(8);
const clientSeed = 'swerte-client';

describe('fair', () => {
  it('HMAC and SHA-256 match node:crypto (browser and Node agree)', async () => {
    for (let nonce = 0; nonce < 20; nonce++) {
      const msg = `${clientSeed}:${nonce}`;
      const expected = createHmac('sha256', serverSeed).update(msg).digest();
      expect(Buffer.from(await hmacSha256(serverSeed, msg)).equals(expected)).toBe(true);
    }
    expect(await sha256Hex(serverSeed)).toBe(createHash('sha256').update(serverSeed).digest('hex'));
  });

  it('bit order: bit i = (bytes[i >> 3] >> (i & 7)) & 1', () => {
    const bytes = new Uint8Array([0b00000101, 0b10000000]);
    expect(pathFromBytes(bytes, 16)).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('is deterministic and verify agrees with the derived path', async () => {
    const a = await derivePath(serverSeed, clientSeed, 3, 16);
    const b = await derivePath(serverSeed, clientSeed, 3, 16);
    expect(a).toEqual(b);
    const v = await verifyRound(serverSeed, clientSeed, 3, 16, 'high');
    expect(v.path).toEqual(a);
    expect(v.bin).toBe(a.reduce((s, x) => s + x, 0));
    expect(v.multiplierX100).toBe(MULTIPLIERS.high[16][v.bin]);
  });

  it('different nonce changes the path', async () => {
    expect(await derivePath(serverSeed, clientSeed, 0, 16)).not.toEqual(
      await derivePath(serverSeed, clientSeed, 1, 16),
    );
  });
});
