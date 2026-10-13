// Chi-square p-value via the regularized upper incomplete gamma Q(df/2, x/2) (Numerical Recipes 6.2).

function lnGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.001208650973866179,
    -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}

function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 1000; n++) {
      del *= x / ++ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Chi-square statistic and p-value of observed counts against expected probabilities. */
export function chiSquare(
  observed: readonly number[],
  probs: readonly number[],
): { stat: number; df: number; p: number } {
  let total = 0;
  for (let i = 0; i < observed.length; i++) total += observed[i];
  let stat = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = total * probs[i];
    stat += (observed[i] - e) ** 2 / e;
  }
  const df = observed.length - 1;
  return { stat, df, p: gammaQ(df / 2, stat / 2) };
}
