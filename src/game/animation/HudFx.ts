import type Phaser from 'phaser';
import { DEPTH, PALETTE, type Layout } from '../../constants';
import { formatMoney } from '../../utils/format';
import { reducedMotion, sd, sx, sy } from '../../utils/responsive';
import { Timeline } from '../../utils/timeline';
import { ANIM } from './animConfig';
import { CountUp } from './CountUp';

export class HudFx {
  readonly balanceCount = new CountUp();
  readonly winCount = new CountUp();
  private readonly betClock = new Timeline();
  private readonly limitClock = new Timeline();
  private readonly lowClock = new Timeline();
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly oldBet: Phaser.GameObjects.Text;
  private layout: Layout | null = null;
  private bet = -1;
  private betX = 0;
  private betY = 0;
  private direction = 1;
  private previousBalance = -1;
  private previousWin = -1;
  private low = false;
  private refreshMs = 0;
  private get still(): boolean {
    return reducedMotion();
  }

  constructor(
    scene: Phaser.Scene,
    private readonly balance: Phaser.GameObjects.Text,
    private readonly win: Phaser.GameObjects.Text,
    private readonly betText: Phaser.GameObjects.Text,
  ) {
    this.border = scene.add.graphics().setDepth(DEPTH.hud);
    this.oldBet = scene.add.text(0, 0, '', {}).setOrigin(0.5).setDepth(DEPTH.hud).setVisible(false);
  }
  get active(): boolean {
    return this.balanceCount.active || this.winCount.active;
  }
  relayout(layout: Layout): void {
    this.layout = layout;
    this.betX = this.betText.x;
    this.betY = this.betText.y;
    this.oldBet.setStyle(this.betText.style).setPosition(this.betX, this.betY);
    this.betClock.skip();
    this.oldBet.setVisible(false);
    this.betText.setAlpha(1);
    this.border.clear();
    this.win.setScale(1);
  }
  sync(balance: number, win: number, bet: number): void {
    if (balance !== this.balanceCount.target) this.balanceCount.start(balance, 0);
    if (win !== this.winCount.target) this.winCount.start(win, 0);
    if (bet !== this.bet) {
      const animate = this.bet >= 0 && !this.still;
      this.oldBet.setText(this.betText.text).setVisible(animate).setAlpha(1);
      this.direction = bet > this.bet ? 1 : -1;
      this.bet = bet;
      this.betText.setText('₱' + formatMoney(bet));
      void this.betClock.wait(animate ? ANIM.betMs : 0);
    }
    const low = balance < bet;
    if (low && !this.low) void this.lowClock.wait(ANIM.lowBalanceMs);
    this.low = low;
    this.paintNumbers();
  }
  land(win: number, multiplier: number, balance: number, short: boolean): void {
    const quiet = short || this.still || multiplier < 100 || win === 0;
    const ms = quiet
      ? 0
      : Math.min(ANIM.winMaxMs, ANIM.winMinMs + Math.log2(Math.max(1, multiplier / 100)) * 100);
    this.winCount.start(win, ms, 0, 0);
    this.balanceCount.start(balance, quiet ? 0 : ANIM.balanceMs, ms);
    this.paintNumbers();
  }
  limit(): void {
    void this.limitClock.wait(ANIM.limitMs);
  }
  warnBalance(): void {
    void this.lowClock.wait(ANIM.lowBalanceMs);
  }
  skip(): void {
    this.balanceCount.skip();
    this.winCount.skip();
    this.betClock.skip();
    this.limitClock.skip();
    this.lowClock.skip();
    this.oldBet.setVisible(false);
    this.betText.setPosition(this.betX, this.betY).setAlpha(1);
    this.win.setScale(1);
    this.border.clear();
    this.paintNumbers();
  }
  update(dt: number, turbo: boolean): void {
    const step = dt / (turbo ? ANIM.turboFactor : 1);
    this.balanceCount.update(step);
    this.winCount.update(step);
    this.betClock.update(step);
    this.limitClock.update(step);
    // Real time, not turbo time: two pulses must stay under 3 Hz (spec section 0).
    this.lowClock.update(dt);
    this.refreshMs += dt;
    if (this.refreshMs >= 33 || !this.active) {
      this.refreshMs = 0;
      this.paintNumbers();
    }
    const p = this.betClock.progress;
    const shift = this.still ? 0 : sd(12) * this.direction;
    this.oldBet
      .setPosition(this.betX, this.betY - shift * p)
      .setAlpha(1 - p)
      .setVisible(p < 1);
    const limit = this.limitClock.progress;
    const shake = this.still ? 0 : Math.sin(limit * Math.PI * 6) * sd(2) * (1 - limit);
    this.betText.setPosition(this.betX + shake, this.betY + shift * (1 - p)).setAlpha(p);
    this.win.setScale(this.still ? 1 : 1 + Math.sin(this.winCount.clock.progress * Math.PI) * 0.04);
    const l = this.layout;
    if (!l) return;
    const g = this.border.clear();
    if (limit < 1)
      g.lineStyle(sd(4), PALETTE.enamel, 1 - limit).strokeRoundedRect(
        sx(l.controls.bet.x - 3),
        sy(l.controls.bet.y - 3),
        sd(l.controls.bet.w + 6),
        sd(l.controls.bet.h + 6),
        sd(10),
      );
    if (this.lowClock.progress < 1) {
      const alpha = this.still ? 0.7 : (1 - Math.cos(this.lowClock.progress * Math.PI * 4)) * 0.45;
      g.lineStyle(sd(4), PALETTE.enamel, alpha).strokeRect(
        sx(l.balance.x),
        sy(l.balance.y),
        sd(l.balance.w),
        sd(l.balance.h),
      );
    } else if (this.balanceCount.active && this.balanceCount.rising) {
      g.lineStyle(sd(3), PALETTE.mustard, 0.6).strokeRect(
        sx(l.balance.x),
        sy(l.balance.y),
        sd(l.balance.w),
        sd(l.balance.h),
      );
    }
  }
  private paintNumbers(): void {
    if (this.previousBalance !== this.balanceCount.value) {
      this.previousBalance = this.balanceCount.value;
      this.balance.setText('₱' + formatMoney(this.previousBalance));
    }
    if (this.previousWin !== this.winCount.value) {
      this.previousWin = this.winCount.value;
      this.win.setText((this.previousWin > 0 ? '+₱' : '₱') + formatMoney(this.previousWin));
    }
  }
}
