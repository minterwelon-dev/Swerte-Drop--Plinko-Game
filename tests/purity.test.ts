import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// src/math and scripts must run in Node: no Phaser, no DOM, no Math.random (rng.ts owns randomness).
const root = join(__dirname, '..');
const files = ['src/math', 'scripts'].flatMap((dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f)),
);

describe('purity', () => {
  it.each(files)('%s has no Phaser/DOM/Math.random', (file) => {
    const src = readFileSync(join(root, file), 'utf8');
    expect(src).not.toMatch(/from ['"]phaser['"]/);
    expect(src).not.toMatch(/\b(window|document|localStorage|navigator)\./);
    expect(src).not.toMatch(/Math\.random\(/);
  });
});
