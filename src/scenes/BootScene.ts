import Phaser from 'phaser';
import { PALETTE } from '../constants';

export const DEFERRED_READY = 'deferredReady';

/**
 * Critical preload. Placeholder art is generated here; real art must keep the same texture keys.
 * Deferred assets (audio, feature art) load in GameScene while the player sits on Idle.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({}, false);
    // Textures are drawn at 64 px and sized with setDisplaySize(sd()).
    g.fillStyle(0x8a5a00, 1).fillCircle(32, 32, 32);
    g.fillStyle(PALETTE.ball, 1).fillCircle(30, 30, 28);
    g.fillStyle(0xfff4c2, 1).fillCircle(22, 21, 9);
    g.generateTexture('ball', 64, 64);
    g.clear();
    g.fillStyle(0xffffff, 0.35).fillCircle(32, 32, 32);
    g.fillStyle(0xffffff, 1).fillCircle(32, 32, 16);
    g.generateTexture('dot', 64, 64);
    g.destroy();
    this.registry.set(DEFERRED_READY, false);
    this.scene.start('Game');
  }
}
