import type { DropRequest, DropResponse, RotateResponse, SeedState, SessionInit } from './types';

/** The only server surface the client depends on. */
export interface RGS {
  init(): Promise<SessionInit>;
  drop(req: DropRequest): Promise<DropResponse>;
  /** Client finished presenting this round; it no longer needs resuming after a refresh. */
  ack(roundId: string): Promise<void>;
  setClientSeed(clientSeed: string): Promise<SeedState>;
  rotateSeed(): Promise<RotateResponse>;
}
