import type {
  DropRequest,
  DropResponse,
  FeatureRequest,
  FeatureResult,
  RotateResponse,
  SeedState,
  SessionInit,
} from './types';

/** The only server surface the client depends on. */
export interface RGS {
  init(): Promise<SessionInit>;
  drop(req: DropRequest): Promise<DropResponse>;
  /** Stage B Plinko Feature: settles the whole bonus round at once. */
  feature(req: FeatureRequest): Promise<FeatureResult>;
  /** Client finished presenting this round (drop or feature); it no longer needs resuming after a refresh. */
  ack(roundId: string): Promise<void>;
  setClientSeed(clientSeed: string): Promise<SeedState>;
  rotateSeed(): Promise<RotateResponse>;
}
