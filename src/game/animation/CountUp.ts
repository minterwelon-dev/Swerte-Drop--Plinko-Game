import { Timeline } from '../../utils/timeline';
import { easeOut } from './animConfig';

/** Integer presentation only. Never modifies the authoritative balance. */
export class CountUp {
  readonly clock = new Timeline();
  value = 0;
  target = 0;
  private from = 0;
  private delay = 0;
  get active(): boolean {
    return this.clock.progress < 1;
  }
  get rising(): boolean {
    return this.value > this.from && this.target > this.from;
  }
  start(target: number, ms: number, delay = 0, from = this.value): void {
    this.target = target;
    this.from = from;
    this.value = from;
    this.delay = delay;
    void this.clock.wait(ms);
    if (ms === 0) this.skip();
  }
  skip(): void {
    this.clock.skip();
    this.delay = 0;
    this.value = this.target;
  }
  update(dt: number): void {
    const usable = Math.max(0, dt - this.delay);
    this.delay = Math.max(0, this.delay - dt);
    this.clock.update(usable);
    this.value = Math.round(this.from + (this.target - this.from) * easeOut(this.clock.progress));
  }
}
