export const SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA =
  'symphony-codex-account-control/v1' as const;
export const SYMPHONY_CODEX_ACCOUNT_RECONNECT_SCHEMA =
  'symphony-codex-account-reconnect/v1' as const;
export const SYMPHONY_ELIXIR_SERVICE = 'symphony-elixir.service' as const;
export const APPROVED_CODEX_ACCOUNT_LABELS = [
  'meetjovie',
  'jovie',
  'timwhite-co',
] as const;

export type ApprovedCodexAccountLabel =
  (typeof APPROVED_CODEX_ACCOUNT_LABELS)[number];
export type CodexAccountState =
  | 'verified'
  | 'stale'
  | 'unknown'
  | 'usage-exhausted';
export type CodexAccountControlAvailability =
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'stale';
export type CodexReconnectPhase =
  | 'idle'
  | 'confirmation'
  | 'authorization-pending'
  | 'succeeded'
  | 'failed'
  | 'expired';

export const CODEX_ACCOUNT_STATE_LABELS = {
  verified: 'Verified',
  stale: 'Stale',
  unknown: 'Unknown',
  'usage-exhausted': 'Usage Exhausted',
} as const satisfies Record<CodexAccountState, string>;
export const CODEX_RECONNECT_PHASE_LABELS = {
  idle: 'Ready',
  confirmation: 'Confirm Reconnect',
  'authorization-pending': 'Authorization Pending',
  succeeded: 'Reconnected',
  failed: 'Reconnect Failed',
  expired: 'Authorization Expired',
} as const satisfies Record<CodexReconnectPhase, string>;
export const SYMPHONY_CODEX_ACCOUNT_OPTIMIZATION_EXCEPTION = Object.freeze({
  kind: 'exception',
  class: 'non-product',
  justification:
    'Operator control-plane Ovie Mac HUD for Gem Symphony Codex accounts; no artist-facing page, link, asset, campaign, recommendation, or content variant.',
});

const SECRETISH =
  /(?:api[_-]?key|token|secret|password|bearer|authorization|access_token|refresh_token)=([^&\s]+)|eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]+/gi;
const SESSION_PHASES = [
  'starting',
  'authorization-pending',
  'succeeded',
  'failed',
  'expired',
] as const;

export function isApprovedCodexAccountLabel(
  value: string
): value is ApprovedCodexAccountLabel {
  return (APPROVED_CODEX_ACCOUNT_LABELS as readonly string[]).includes(value);
}
export function stripCodexAccountSecrets(value: string): string {
  return value.replace(SECRETISH, match =>
    match.includes('=')
      ? `${match.slice(0, match.indexOf('='))}=[redacted]`
      : '[redacted]'
  );
}
export function classifyCodexBinding(label: string | null) {
  return {
    recognized: Boolean(label && isApprovedCodexAccountLabel(label)),
    selectable: false as const,
    canSwitch: false as const,
    canRestart: false as const,
  };
}
export function classifyCodexAccountState(input: {
  readonly authPresent: boolean;
  readonly cooldownUntil: number | null;
  readonly readinessExpiresAt: number | null;
  readonly now: number;
}): CodexAccountState {
  if (input.cooldownUntil != null && input.cooldownUntil > input.now) {
    return 'usage-exhausted';
  }
  if (!input.authPresent) return 'unknown';
  return input.readinessExpiresAt == null ||
    input.readinessExpiresAt < input.now
    ? 'stale'
    : 'verified';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export type CodexAccountRow = {
  readonly label: ApprovedCodexAccountLabel;
  readonly state: CodexAccountState;
  readonly reconnectEligible: boolean;
};
export type CodexBindingReview = {
  readonly service: typeof SYMPHONY_ELIXIR_SERVICE;
  readonly boundLabel: string | null;
  readonly recognized: boolean;
  readonly selectable: false;
  readonly canSwitch: false;
  readonly canRestart: false;
  readonly reviewOnly: true;
  readonly serviceActive: boolean | null;
};
export type CodexReconnectReceipt = {
  readonly schema: typeof SYMPHONY_CODEX_ACCOUNT_RECONNECT_SCHEMA;
  readonly account: ApprovedCodexAccountLabel;
  readonly completedAt: string;
  readonly source: 'device-auth';
  readonly result: 'selected-account-verified';
};
export type CodexReconnectSession = {
  readonly id: string;
  readonly account: ApprovedCodexAccountLabel;
  readonly phase: Exclude<CodexReconnectPhase, 'idle' | 'confirmation'>;
  readonly userCode: string | null;
  readonly verificationUri: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly receipt: CodexReconnectReceipt | null;
  readonly error: string | null;
};
export type CodexAccountControlSnapshot = {
  readonly schema: typeof SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA;
  readonly service: typeof SYMPHONY_ELIXIR_SERVICE;
  readonly observedAt: string | null;
  readonly availability: Exclude<CodexAccountControlAvailability, 'loading'>;
  readonly binding: CodexBindingReview;
  readonly accounts: readonly CodexAccountRow[];
  readonly session: CodexReconnectSession | null;
  readonly error: string | null;
};

function lockedBinding(
  boundLabel: string | null,
  serviceActive: boolean | null
): CodexBindingReview {
  return {
    service: SYMPHONY_ELIXIR_SERVICE,
    boundLabel,
    recognized: classifyCodexBinding(boundLabel).recognized,
    selectable: false,
    canSwitch: false,
    canRestart: false,
    reviewOnly: true,
    serviceActive,
  };
}

export function emptyCodexAccountControlSnapshot(
  availability: Exclude<CodexAccountControlAvailability, 'loading' | 'ready'>,
  error: string | null = null
): CodexAccountControlSnapshot {
  return {
    schema: SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA,
    service: SYMPHONY_ELIXIR_SERVICE,
    observedAt: null,
    availability,
    binding: lockedBinding(null, null),
    accounts: APPROVED_CODEX_ACCOUNT_LABELS.map(label => ({
      label,
      state: 'unknown' as const,
      reconnectEligible: false,
    })),
    session: null,
    error,
  };
}

function parseSession(value: unknown): CodexReconnectSession | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const account = text(value.account);
  const phase = text(value.phase);
  const receiptRaw = isRecord(value.receipt) ? value.receipt : null;
  const receiptAccount = receiptRaw ? text(receiptRaw.account) : null;
  const completedAt = receiptRaw ? text(receiptRaw.completedAt) : null;
  if (
    !id ||
    !account ||
    !isApprovedCodexAccountLabel(account) ||
    !phase ||
    !SESSION_PHASES.includes(phase as (typeof SESSION_PHASES)[number])
  ) {
    return null;
  }
  return {
    id,
    account,
    phase:
      phase === 'starting'
        ? 'authorization-pending'
        : (phase as Exclude<CodexReconnectPhase, 'idle' | 'confirmation'>),
    userCode: text(value.userCode),
    verificationUri: text(value.verificationUri),
    createdAt: text(value.createdAt) ?? new Date(0).toISOString(),
    expiresAt: text(value.expiresAt) ?? new Date(0).toISOString(),
    receipt:
      completedAt &&
      receiptAccount &&
      isApprovedCodexAccountLabel(receiptAccount)
        ? {
            schema: SYMPHONY_CODEX_ACCOUNT_RECONNECT_SCHEMA,
            account: receiptAccount,
            completedAt,
            source: 'device-auth',
            result: 'selected-account-verified',
          }
        : null,
    error: text(value.error),
  };
}

export function parseCodexAccountControlSnapshot(
  value: unknown
): CodexAccountControlSnapshot | null {
  if (
    !isRecord(value) ||
    value.schema !== SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA
  ) {
    return null;
  }
  const availability =
    value.availability === 'stale' || value.availability === 'unavailable'
      ? value.availability
      : 'ready';
  const bindingRaw = isRecord(value.binding) ? value.binding : null;
  const boundLabel = bindingRaw ? text(bindingRaw.boundLabel) : null;
  const listed = Array.isArray(value.accounts)
    ? value.accounts.flatMap(row => {
        if (!isRecord(row)) return [];
        const label = text(row.label);
        const state = text(row.state);
        if (
          !label ||
          !isApprovedCodexAccountLabel(label) ||
          !state ||
          !(state in CODEX_ACCOUNT_STATE_LABELS)
        ) {
          return [];
        }
        return [
          {
            label,
            state: state as CodexAccountState,
            reconnectEligible: row.reconnectEligible !== false,
          },
        ];
      })
    : [];
  const byLabel = new Map(listed.map(row => [row.label, row]));
  return {
    schema: SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA,
    service: SYMPHONY_ELIXIR_SERVICE,
    observedAt: text(value.observedAt),
    availability,
    binding: lockedBinding(
      boundLabel,
      bindingRaw?.serviceActive === true
        ? true
        : bindingRaw?.serviceActive === false
          ? false
          : null
    ),
    accounts: APPROVED_CODEX_ACCOUNT_LABELS.map(
      label =>
        byLabel.get(label) ?? {
          label,
          state: 'unknown' as const,
          reconnectEligible: availability === 'ready',
        }
    ),
    session: parseSession(value.session),
    error: text(value.error),
  };
}

export function reconnectPhaseFromSnapshot(
  snapshot: CodexAccountControlSnapshot,
  confirming: ApprovedCodexAccountLabel | null
): CodexReconnectPhase {
  if (confirming) return 'confirmation';
  const phase = snapshot.session?.phase;
  return phase === 'authorization-pending' ||
    phase === 'succeeded' ||
    phase === 'failed' ||
    phase === 'expired'
    ? phase
    : 'idle';
}
