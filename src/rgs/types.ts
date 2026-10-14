import type { MultiplierX100, Risk, Rows } from '../math/config';
import type { FeatureBall } from '../math/feature';

export interface DropRequest {
  sessionId: string;
  bet: number;
  rows: Rows;
  risk: Risk;
}

export interface DropResponse {
  roundId: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
  rows: Rows;
  risk: Risk;
  bet: number;
  path: number[]; // length = rows, 0 = left, 1 = right
  bin: number; // sum(path)
  multiplierX100: MultiplierX100;
  win: number; // minor units
  balance: number; // after the round
}

export interface SeedState {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface RotateResponse {
  revealedServerSeed: string;
  newServerSeedHash: string;
}

/** The seed pair the client expects the feature to be played under; stale refs are rejected. */
export type SeedRef = Pick<SeedState, 'serverSeedHash' | 'clientSeed'>;

/** Stage B feature trigger. In the slot this follows 3 scatters; the triggering spin already paid the bet. */
export interface FeatureRequest {
  sessionId: string;
  bet: number;
  seedRef: SeedRef;
}

export interface FeatureResult {
  roundId: string;
  /** Wheel nonce; ball i used nonce + 1 + i. */
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
  bet: number;
  balls: FeatureBall[];
  totalWin: number;
  capped: boolean;
  balance: number; // after the feature
}

export interface SessionInit {
  sessionId: string;
  balance: number;
  seed: SeedState;
  /** Rounds settled on the server whose landing the client never acknowledged (refresh mid-drop). */
  pending: DropResponse[];
  /** Feature settled on the server but never acknowledged (refresh mid-feature). */
  pendingFeature: FeatureResult | null;
}

export type RGSErrorCode = 'NETWORK' | 'INSUFFICIENT_FUNDS' | 'BAD_REQUEST' | 'BAD_SESSION';

export class RGSError extends Error {
  readonly code: RGSErrorCode;

  constructor(code: RGSErrorCode, message: string) {
    super(message);
    this.name = 'RGSError';
    this.code = code;
  }
}
