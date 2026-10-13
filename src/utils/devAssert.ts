/** Dev-only invariant check. Compiled out of production builds. */
export function devAssert(cond: boolean, message: string): void {
  if (import.meta.env.DEV && !cond) console.error(`[assert] ${message}`);
}
