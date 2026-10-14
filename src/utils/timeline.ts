/**
 * Skippable presentation step driven by frame time. wait() resolves after `ms` of update() time,
 * or at once on skip(). Starting a new wait finishes the previous one. No Phaser import, so it is testable.
 */
export class Timeline {
  private total = 0;
  private left = 0;
  private done: (() => void) | null = null;

  wait(ms: number): Promise<void> {
    this.finish();
    this.total = this.left = Math.max(0, ms);
    return new Promise((resolve) => (this.done = resolve));
  }

  /** 0..1 through the current wait; 1 once finished or skipped. */
  get progress(): number {
    return this.total > 0 ? 1 - this.left / this.total : 1;
  }

  skip(): void {
    this.finish();
  }

  update(dt: number): void {
    if (!this.done) return;
    this.left -= dt;
    if (this.left <= 0) this.finish();
  }

  private finish(): void {
    this.left = 0;
    const done = this.done;
    this.done = null;
    done?.();
  }
}
