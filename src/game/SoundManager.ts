import Phaser from 'phaser';
import type { Tier } from '../constants';

/** Landing chord per tier, in semitones above the base note. */
const TIER_NOTES: Record<Tier, number[]> = {
  lose: [0],
  low: [0, 7],
  mid: [0, 4, 7],
  high: [0, 4, 7, 12],
  top: [0, 4, 7, 12, 16],
  mini: [0, 4, 7, 12],
  minor: [0, 4, 7, 12, 16],
  major: [0, 4, 7, 12, 16, 19],
};

/**
 * Audio gating, mute and tab-hidden suspend. Placeholder sounds are synthesized with Web Audio;
 * real samples can replace tick()/land() without changing callers.
 */
export class SoundManager {
  muted = false;
  private unlocked = false;
  private readonly sound: Phaser.Sound.WebAudioSoundManager | null;
  private readonly onVisibility = () => this.applyVisibility();

  constructor(scene: Phaser.Scene) {
    this.sound = scene.sound instanceof Phaser.Sound.WebAudioSoundManager ? scene.sound : null;
    // No autoplay: silent until the first user gesture.
    const unlock = () => {
      this.unlocked = true;
      void this.sound?.context.resume();
    };
    scene.input.once(Phaser.Input.Events.POINTER_DOWN, unlock);
    scene.input.keyboard?.once('keydown', unlock);
    document.addEventListener('visibilitychange', this.onVisibility);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      document.removeEventListener('visibilitychange', this.onVisibility),
    );
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.sound) this.sound.mute = this.muted;
  }

  /** Peg hit: pitch rises with the row. */
  tick(row: number, rows: number): void {
    this.blip(660 * 2 ** ((row / rows) * 1.2), 0.05, 0.05, 'triangle');
  }

  land(tier: Tier): void {
    const notes = TIER_NOTES[tier];
    for (let i = 0; i < notes.length; i++) {
      this.blip(
        392 * 2 ** (notes[i] / 12),
        0.25 + i * 0.04,
        tier === 'lose' ? 0.05 : 0.08,
        'sine',
        i * 0.035,
      );
    }
  }

  private applyVisibility(): void {
    const ctx = this.sound?.context;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (this.unlocked) void ctx.resume();
  }

  private blip(freq: number, dur: number, gain: number, type: OscillatorType, delay = 0): void {
    const sm = this.sound;
    if (!sm || !this.unlocked || this.muted || document.hidden) return;
    const ctx = sm.context;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(sm.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}
