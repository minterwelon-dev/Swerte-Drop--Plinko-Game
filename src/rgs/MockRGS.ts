import { BET_LEVELS, RISKS, ROWS_OPTIONS } from '../math/config';
import { buildDrop } from '../math/drop';
import { derivePath, sha256Hex } from '../math/fair';
import { BALL_WHEEL, buildFeature, deriveFeature, FEATURE_ROWS } from '../math/feature';
import { Rng, cryptoHex, cryptoSeed } from '../math/rng';
import type { RGS } from './RGS';
import {
  RGSError,
  type DropRequest,
  type DropResponse,
  type FeatureRequest,
  type FeatureResult,
  type RotateResponse,
  type SeedState,
  type SessionInit,
} from './types';

/** Subset of Web Storage the mock persists to. Injected so tests run in Node. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MockRGSOptions {
  startingBalance?: number;
  latencyMs?: number;
  /** 0..1 chance a request fails with NETWORK before touching state. */
  failureRate?: number;
  /** Test mode: deterministic server seeds, client seed and failure rolls. */
  seed?: number;
  storage?: KeyValueStore;
  storageKey?: string;
}

interface PersistedState {
  sessionId: string;
  balance: number;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  roundCounter: number;
  pending: DropResponse[];
  /** Absent in saves from before Phase 4. */
  pendingFeature?: FeatureResult | null;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

// The server seed lives in the browser here. This demonstrates the protocol, not a real trust model.
export class MockRGS implements RGS {
  latencyMs: number;
  failureRate: number;
  private readonly opts: MockRGSOptions;
  private readonly rng: Rng;
  private readonly deterministic: boolean;
  private readonly storage: KeyValueStore;
  private readonly key: string;
  private state: PersistedState | null = null;
  private serverSeedHash = '';
  private forcer: ((rows: number) => number[]) | null = null;
  // State changes run one at a time so nonce and balance never interleave across the async HMAC.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(opts: MockRGSOptions = {}) {
    this.opts = opts;
    this.latencyMs = opts.latencyMs ?? 0;
    this.failureRate = opts.failureRate ?? 0;
    this.deterministic = opts.seed !== undefined;
    this.rng = new Rng(opts.seed ?? cryptoSeed());
    this.storage = opts.storage ?? (globalThis.localStorage as KeyValueStore | undefined) ?? memoryStore();
    this.key = opts.storageKey ?? 'swertedrop.mockrgs';
  }

  async init(): Promise<SessionInit> {
    await this.network();
    return this.serial(async (s) => ({
      sessionId: s.sessionId,
      balance: s.balance,
      seed: this.seedState(s),
      pending: [...s.pending],
      pendingFeature: s.pendingFeature ?? null,
    }));
  }

  async drop(req: DropRequest): Promise<DropResponse> {
    await this.network();
    return this.serial(async (s) => {
      if (req.sessionId !== s.sessionId) throw new RGSError('BAD_SESSION', 'unknown session');
      if (!(BET_LEVELS as readonly number[]).includes(req.bet))
        throw new RGSError('BAD_REQUEST', `bad bet ${req.bet}`);
      if (!(ROWS_OPTIONS as readonly number[]).includes(req.rows))
        throw new RGSError('BAD_REQUEST', `bad rows ${req.rows}`);
      if (!(RISKS as readonly string[]).includes(req.risk))
        throw new RGSError('BAD_REQUEST', `bad risk ${req.risk}`);
      if (s.balance < req.bet) throw new RGSError('INSUFFICIENT_FUNDS', 'balance below bet');

      const nonce = s.nonce;
      let path = await derivePath(s.serverSeed, s.clientSeed, nonce, req.rows);
      if (import.meta.env.DEV && this.forcer) {
        path = this.forcer(req.rows);
        this.forcer = null;
      }
      const outcome = buildDrop(path, req.bet, req.rows, req.risk);
      s.nonce = nonce + 1;
      s.balance = s.balance - req.bet + outcome.win;
      const res: DropResponse = {
        roundId: `r${++s.roundCounter}`,
        nonce,
        serverSeedHash: this.serverSeedHash,
        clientSeed: s.clientSeed,
        rows: req.rows,
        risk: req.risk,
        bet: req.bet,
        ...outcome,
        balance: s.balance,
      };
      s.pending.push(res);
      this.save();
      return res;
    });
  }

  /** Free bonus round: no bet is taken (the triggering slot spin paid it); the capped total is credited. */
  async feature(req: FeatureRequest): Promise<FeatureResult> {
    await this.network();
    return this.serial(async (s) => {
      if (req.sessionId !== s.sessionId) throw new RGSError('BAD_SESSION', 'unknown session');
      if (!(BET_LEVELS as readonly number[]).includes(req.bet))
        throw new RGSError('BAD_REQUEST', `bad bet ${req.bet}`);
      if (req.seedRef.serverSeedHash !== this.serverSeedHash || req.seedRef.clientSeed !== s.clientSeed)
        throw new RGSError('BAD_REQUEST', 'stale seed reference');
      if (s.pendingFeature) throw new RGSError('BAD_REQUEST', 'feature already in progress');

      const nonce = s.nonce;
      let outcome = await deriveFeature(s.serverSeed, s.clientSeed, nonce, req.bet);
      if (import.meta.env.DEV && this.forcer) {
        // Forced feature: the most balls, every one forced. Forcing the edge demonstrates the cap.
        const forcer = this.forcer;
        this.forcer = null;
        const most = BALL_WHEEL[BALL_WHEEL.length - 1].balls;
        outcome = buildFeature(
          Array.from({ length: most }, () => forcer(FEATURE_ROWS)),
          req.bet,
        );
      }
      s.nonce = nonce + 1 + outcome.balls.length;
      s.balance += outcome.totalWin;
      const res: FeatureResult = {
        roundId: `f${++s.roundCounter}`,
        nonce,
        serverSeedHash: this.serverSeedHash,
        clientSeed: s.clientSeed,
        bet: req.bet,
        ...outcome,
        balance: s.balance,
      };
      s.pendingFeature = res;
      this.save();
      return res;
    });
  }

  async ack(roundId: string): Promise<void> {
    await this.serial(async (s) => {
      s.pending = s.pending.filter((r) => r.roundId !== roundId);
      if (s.pendingFeature?.roundId === roundId) s.pendingFeature = null;
      this.save();
    });
  }

  async setClientSeed(clientSeed: string): Promise<SeedState> {
    await this.network();
    const trimmed = clientSeed.trim();
    if (trimmed.length < 1 || trimmed.length > 64)
      throw new RGSError('BAD_REQUEST', 'client seed must be 1 to 64 chars');
    return this.serial(async (s) => {
      s.clientSeed = trimmed;
      this.save();
      return this.seedState(s);
    });
  }

  async rotateSeed(): Promise<RotateResponse> {
    await this.network();
    return this.serial(async (s) => {
      const revealedServerSeed = s.serverSeed;
      s.serverSeed = this.newServerSeed();
      s.nonce = 0;
      this.serverSeedHash = await sha256Hex(s.serverSeed);
      this.save();
      return { revealedServerSeed, newServerSeedHash: this.serverSeedHash };
    });
  }

  /** DEV only: the next drop (or every ball of the next feature) uses this path instead of the fair one. Such rounds do not verify. */
  forceNextPath(forcer: ((rows: number) => number[]) | null): void {
    if (import.meta.env.DEV) this.forcer = forcer;
  }

  private seedState(s: PersistedState): SeedState {
    return { serverSeedHash: this.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce };
  }

  /** Runs fn after every earlier state change, with state loaded and the seed hash cached. */
  private serial<T>(fn: (s: PersistedState) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const s = this.load();
      if (!this.serverSeedHash) this.serverSeedHash = await sha256Hex(s.serverSeed);
      return fn(s);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Simulated transport: latency, then maybe a failure. Never touches state. */
  private async network(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    if (this.failureRate > 0 && this.rng.next() < this.failureRate) {
      throw new RGSError('NETWORK', 'simulated network failure');
    }
  }

  private newServerSeed(): string {
    return this.deterministic ? this.rng.hex(32) : cryptoHex(32);
  }

  private load(): PersistedState {
    if (this.state) return this.state;
    const raw = this.storage.getItem(this.key);
    if (raw) {
      try {
        this.state = JSON.parse(raw) as PersistedState;
        return this.state;
      } catch {
        // Corrupt save: start a fresh play-money session below.
      }
    }
    this.state = {
      sessionId: `s-${this.deterministic ? this.rng.hex(8) : cryptoHex(8)}`,
      balance: this.opts.startingBalance ?? 100_000,
      serverSeed: this.newServerSeed(),
      clientSeed: this.deterministic ? this.rng.hex(8) : cryptoHex(8),
      nonce: 0,
      roundCounter: 0,
      pending: [],
    };
    this.save();
    return this.state;
  }

  private save(): void {
    this.storage.setItem(this.key, JSON.stringify(this.state));
  }
}
