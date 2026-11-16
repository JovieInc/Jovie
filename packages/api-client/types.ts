/** Type-only client API; runtime releases need no additional module. */
import type { ResponseCache } from './cache.ts';
import type { PriorityName } from './contract.ts';
import type { Failure } from './headers.ts';
import type { CredentialState } from './policy.ts';
import type { LedgerStore } from './store.ts';

export interface ApiResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly fromCache: 'ttl' | 'etag' | null;
  readonly attempts: number;
  json<T = unknown>(): T;
}

export interface RequestOptions {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | object;
  readonly priority?: PriorityName;
  readonly costs?: Readonly<Record<string, number>>;
  readonly write?: boolean;
  readonly idempotent?: boolean;
  /** Serve a stored body younger than this without any network call. */
  readonly cacheTtlMs?: number;
  /** Send If-None-Match for GETs (default: provider's conditionalGet). */
  readonly conditional?: boolean;
  readonly coalesce?: boolean;
  readonly maxAttempts?: number;
  readonly maxWaitMs?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** USD this call costs; defaults to the provider's pricing.perCallUsd. */
  readonly priceUsd?: number;
}

/** Bridges legacy state files into the ledger (see legacy.ts). */
export interface LedgerHooks {
  prepare?(): Promise<unknown>;
  merge?(state: CredentialState, prepared: unknown, nowMs: number): void;
  publish?(
    state: CredentialState,
    failure: Failure,
    nowMs: number
  ): Promise<void>;
}

export interface ApiClientOptions {
  readonly provider: string;
  /** Stable bucket identity (never the secret). See hashCredential(). */
  readonly credential: string;
  readonly authorize?: (headers: Headers) => void | Promise<void>;
  readonly store?: LedgerStore;
  readonly cache?: ResponseCache;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly log?: (event: Record<string, unknown>) => void;
  readonly hooks?: LedgerHooks;
  /** Per-credential daily USD cap; defaults to the provider's pricing.dailyCapUsd. */
  readonly dailySpendCapUsd?: number;
}

export interface ApiClient {
  readonly provider: string;
  readonly credential: string;
  request(options: RequestOptions): Promise<ApiResponse>;
  state(): Promise<CredentialState | null>;
}
