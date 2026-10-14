import { gameConfig } from '../../gameConfig';

/** Public timing values stay in gameConfig; presenters share this one alias. */
export const ANIM = gameConfig.motion;
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
