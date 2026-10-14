import type Phaser from 'phaser';
import type { Board } from '../Board';
import type { BoardGeometry } from '../BallPath';
import type { Bins } from '../Bins';
import type { Hud } from '../Hud';
import type { HistoryStrip } from '../HistoryStrip';
import { WinPresenter } from './WinPresenter';
import { BigWin } from './BigWin';
import type { Booth } from '../Booth';
import { currentLayout } from '../../utils/responsive';

/** Coordinates presentation only. GameScene and the state machine retain settlement ownership. */
export class AnimDirector {
  readonly wins: WinPresenter;
  readonly big: BigWin;
  constructor(
    scene: Phaser.Scene,
    private readonly board: Board,
    private readonly bins: Bins,
    private readonly hud: Hud,
    private readonly history: HistoryStrip,
    private readonly booth: Booth,
  ) {
    this.wins = new WinPresenter(scene);
    this.big = new BigWin(scene);
  }
  get active(): boolean {
    return (
      this.big.active || this.wins.active || this.bins.active || this.hud.fx.active || this.history.active
    );
  }
  launch(): void {
    this.board.releaseBall();
  }
  land(
    bin: number,
    win: number,
    multiplier: number,
    balance: number,
    geo: BoardGeometry,
    short: boolean,
    classic = true,
  ): void {
    this.bins.land(bin, short);
    this.wins.land(bin, win, multiplier, geo, short);
    if (classic) {
      if (!short) {
        this.booth.celebrate(multiplier);
        this.big.show(win, multiplier);
      }
      this.history.push(multiplier, short);
      this.hud.fx.land(win, multiplier, balance, short);
    }
  }
  skip(): void {
    this.big.skip();
    this.booth.skip();
    this.board.skip();
    this.bins.skip();
    this.wins.skip();
    this.hud.skipPresentation();
    this.history.skip();
  }
  relayout(geo: BoardGeometry): void {
    this.big.relayout(currentLayout());
    this.wins.relayout(geo);
  }
  update(dt: number, turbo: boolean): void {
    this.big.update(dt, turbo);
    this.board.update(dt, turbo);
    this.bins.update(dt, turbo);
    this.wins.update(dt, turbo);
    this.hud.update(dt, turbo);
    this.history.update(dt, turbo);
  }
}
