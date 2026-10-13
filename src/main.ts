import Phaser from 'phaser';
import './styles.css';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { bindResponsiveResize, readBrowserViewport, setViewport } from './utils/responsive';

function start(): void {
  // Parent is created at runtime so Phaser never boots before <body> exists.
  const parent = document.createElement('div');
  parent.id = 'game';
  document.body.appendChild(parent);

  const vp = readBrowserViewport();
  setViewport(vp);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    transparent: true,
    parent,
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(vp.w * vp.dpr),
      height: Math.round(vp.h * vp.dpr),
      zoom: 1 / vp.dpr,
    },
    render: { antialias: true, pixelArt: false },
    // Clicks on DOM modals must not reach canvas buttons underneath (Phaser hit-tests window mousedowns).
    input: { windowEvents: false },
    scene: [BootScene, GameScene],
  });
  bindResponsiveResize(game);
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
