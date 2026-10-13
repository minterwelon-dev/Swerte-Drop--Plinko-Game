/** C(n, k) as an exact integer (exact for the n <= 16 used here). */
export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Integer weights C(n, k) for k = 0..n; they sum to 2^n. */
export function binWeights(n: number): number[] {
  const w: number[] = [];
  for (let k = 0; k <= n; k++) w.push(binom(n, k));
  return w;
}

/** P(bin k) = C(n, k) / 2^n. */
export function binProbabilities(n: number): number[] {
  const total = 2 ** n;
  return binWeights(n).map((w) => w / total);
}
