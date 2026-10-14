import Phaser from 'phaser';
import boardArt from '../../Assets/art/board-v2.webp';
import woodArt from '../../Assets/art/wood-v1.webp';
import canopyArt from '../../Assets/art/canopy-v1.webp';

export const DEFERRED_READY = 'deferredReady';

/** Generated booth materials; text and all game values remain live objects. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('board-art', boardArt);
    this.load.image('wood-art', woodArt);
    this.load.image('canopy-art', canopyArt);
  }

  create(): void {
    this.textures.get('wood-art').add('sign-wide', 0, 0, 170, 768, 128);
    this.textures.get('wood-art').add('sign-tall', 0, 0, 170, 768, 300);
    this.textures.get('wood-art').add('counter-wide', 0, 0, 170, 768, 395);
    this.textures.get('wood-art').add('counter-tall', 0, 190, 0, 389, 768);
    const sphere = (key: string, light: string, mid: string, dark: string) => {
      const texture = this.textures.createCanvas(key, 64, 64)!;
      const c = texture.getContext();
      const gradient = c.createRadialGradient(21, 18, 2, 32, 32, 30);
      gradient.addColorStop(0, light);
      gradient.addColorStop(0.45, mid);
      gradient.addColorStop(1, dark);
      c.fillStyle = gradient;
      c.beginPath();
      c.arc(32, 32, 30, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff8dc';
      c.beginPath();
      c.ellipse(23, 19, 5, 7, 0.4, 0, Math.PI * 2);
      c.fill();
      texture.refresh();
    };
    sphere('ball', '#ffe27a', '#e8b21e', '#9c6a0c');
    sphere('brass-peg', '#fff2c2', '#d9a441', '#6e4a16');
    const bulb = this.textures.createCanvas('bulb', 64, 80)!;
    const b = bulb.getContext();
    const glow = b.createRadialGradient(32, 40, 3, 32, 40, 32);
    glow.addColorStop(0, '#ffd36b99');
    glow.addColorStop(1, '#ffd36b00');
    b.fillStyle = glow;
    b.fillRect(0, 0, 64, 80);
    b.fillStyle = '#fff1c9';
    b.beginPath();
    b.ellipse(32, 40, 10, 15, 0, 0, Math.PI * 2);
    b.fill();
    bulb.refresh();
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 0.35).fillCircle(32, 32, 32);
    g.fillStyle(0xffffff, 1).fillCircle(32, 32, 16);
    g.generateTexture('dot', 64, 64);
    g.destroy();
    this.registry.set(DEFERRED_READY, false);
    this.scene.start('Game');
  }
}
