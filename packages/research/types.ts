import sourcesJson from './sources.json' with { type: 'json' };

export type Freshness = 'live' | 'day' | 'week' | 'month' | 'evergreen';
export type Mode = 'quick' | 'standard' | 'deep';
export type Billing = 'free' | 'credits' | 'plan-credits' | 'paid';
export type SourceKind =
  | 'search'
  | 'fetch'
  | 'social'
  | 'deep'
  | 'answer'
  | 'judge';

export interface Caps {
  readonly dailyCalls?: number;
  readonly monthlyCalls?: number;
  readonly dailyUsd?: number;
  readonly monthlyUsd?: number;
}

export interface SourceSpec {
  readonly tier: number;
  readonly kind: SourceKind;
  readonly billing: Billing;
  readonly apiProvider?: string;
  readonly usdPerCall?: number;
  readonly creditsPerCall?: number;
  readonly caps?: Caps;
  readonly agentId?: string;
  readonly note: string;
}

export interface SourcesConfig {
  readonly schema: 'jovie-research-sources/v1';
  readonly reviewed: string;
  readonly freshnessTtlMs: Readonly<Record<Freshness, number>>;
  /** Words that mark a question as about our own systems (no paid tier). */
  readonly internalTerms?: readonly string[];
  readonly judge: {
    readonly order: readonly string[];
    readonly keepScore: number;
    readonly goodScore: number;
    readonly enoughGood: Readonly<Record<Mode, number>>;
  };
  readonly sources: Readonly<Record<string, SourceSpec>>;
}

export const SOURCES = sourcesJson as SourcesConfig;

export interface ResearchRequest {
  readonly query: string;
  readonly freshness?: Freshness;
  readonly mode?: Mode;
  /** Include social/last-30-days sources (slow; off by default). */
  readonly social?: boolean;
  /** Stop after local sources (never spend). */
  readonly localOnly?: boolean;
  /** Highest tier allowed (0 local, 1 credits/free, 2 paid). */
  readonly maxTier?: number;
  /** Skip the cache read (still writes). */
  readonly refresh?: boolean;
  /** Persist the result as a gbrain research page (default true). */
  readonly persist?: boolean;
  /** Caller label recorded in metrics (agent, skill, lane). */
  readonly caller?: string;
}

export interface Hit {
  readonly source: string;
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly publishedAt?: string;
  /** Fetched page text (fetch sources only), bounded. */
  readonly content?: string;
  /** Judge relevance 0..3 (junk, tangential, relevant, answers). */
  score?: number;
}

export interface SourceRun {
  readonly source: string;
  readonly tier: number;
  readonly ok: boolean;
  readonly hits: number;
  readonly ms: number;
  readonly usd: number;
  readonly skipped?: string;
  readonly error?: string;
}

export interface ResearchResult {
  readonly schema: 'jovie-research-result/v1';
  readonly query: string;
  readonly key: string;
  readonly freshness: Freshness;
  readonly mode: Mode;
  readonly social?: boolean;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly cache: 'miss' | 'local' | 'similar' | 'gbrain' | 'inflight';
  readonly stoppedAtTier: number;
  readonly escalated: boolean;
  readonly hits: readonly Hit[];
  readonly dropped: number;
  readonly runs: readonly SourceRun[];
  readonly judge: {
    readonly model: string | null;
    readonly usd: number;
    readonly ms: number;
  };
  readonly usd: number;
  readonly ms: number;
  readonly answer?: string;
  readonly gbrainSlug?: string;
  readonly priorDecisions: readonly { slug: string; title: string }[];
}

export interface Verdict {
  readonly model: string;
  readonly scores: number[];
  /** Probability that the kept hits together answer the query. */
  readonly answered: number;
  readonly usd: number;
  readonly ms: number;
}

export interface Judge {
  readonly name: string;
  judge(query: string, hits: readonly Hit[]): Promise<Verdict>;
}
