import type { MultiplierX100, Risk, Rows } from '../math/config';

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

export interface SessionInit {
  sessionId: string;
  balance: number;
  seed: SeedState;
  /** Rounds settled on the server whose landing the client never acknowledged (refresh mid-drop). */
  pending: DropResponse[];
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
