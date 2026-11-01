/** Wire shapes of the fleet audit Worker (workers/observability-ingest/src/audit). */
export type FleetAuditEvent = {
  readonly id: string;
  readonly ts: string;
  readonly actor_agent: string;
  readonly session_id: string | null;
  readonly host: string | null;
  readonly repo: string | null;
  readonly target: string;
  readonly action: string;
  readonly danger: 0 | 1;
  readonly reason: string | null;
  readonly issue: string | null;
  readonly outcome: string | null;
  readonly before: string | null;
  readonly after: string | null;
  readonly source: 'gh-shim' | 'git-shim' | 'broker' | 'correlator';
};

export type FleetAuditCorrelation = {
  readonly id: string;
  readonly observed_at: string;
  readonly repo: string | null;
  readonly target: string;
  readonly change: string;
  readonly github_actor: string | null;
  readonly matched_event_id: string | null;
  readonly status: 'attributed' | 'unattributed';
};

export type FleetAuditSummary = {
  readonly budget: {
    readonly bytes_month: number;
    readonly limit_bytes: number;
    readonly pct: number;
  };
  readonly dangerous: readonly FleetAuditEvent[];
  readonly unattributed: readonly FleetAuditCorrelation[];
  readonly counts: { readonly events_24h: number; readonly events_7d: number };
  readonly top_actors_24h?: readonly {
    readonly actor_agent: string;
    readonly n: number;
  }[];
};

export type FleetAuditWho = {
  readonly events: readonly FleetAuditEvent[];
  readonly correlations: readonly FleetAuditCorrelation[];
};

/** `not_configured` is a normal state (no token yet), not an error. */
export type FleetAuditResult<T> =
  | { readonly state: 'ok'; readonly data: T }
  | { readonly state: 'not_configured' }
  | { readonly state: 'unavailable' };

export const FLEET_AUDIT_MAX_LIMIT = 200;
