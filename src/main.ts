import Phaser from 'phaser';
import './styles.css';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { bindResponsiveResize, readBrowserViewport, RELAYOUT_EVENT, setViewport } from './utils/responsive';

async function start(): Promise<void> {
  // A stalled font request must never block iOS boot.
  const fonts = Promise.all([
    document.fonts.load('32px Bungee'),
    document.fonts.load('700 24px "Nunito Sans"'),
  ]);
  await Promise.race([fonts.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 1500))]);
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
  // Phaser starts with hasFocus false and only flips it on a later window focus event, so a page that loads
  // already focused keeps ambient animation frozen until the first click. Replay it on the first step,
  // after Phaser binds window.onfocus.
  game.events.once(Phaser.Core.Events.STEP, () => {
    if (document.hasFocus()) window.dispatchEvent(new Event('focus'));
  });
  bindResponsiveResize(game);
  void fonts.then(() => game.events.emit(RELAYOUT_EVENT)).catch(() => undefined);
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
