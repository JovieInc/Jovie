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

export function isApprovedCodexAccountLabel(
  value: string
): value is ApprovedCodexAccountLabel {
  return (APPROVED_CODEX_ACCOUNT_LABELS as readonly string[]).includes(value);
}

export function stripCodexAccountSecrets(text: string): string {
  return text.replace(SECRETISH, match =>
    match.includes('=')
      ? `${match.slice(0, match.indexOf('='))}=[redacted]`
      : '[redacted]'
  );
}

export function classifyCodexBinding(label: string | null): {
  readonly recognized: boolean;
  readonly selectable: false;
  readonly canSwitch: false;
  readonly canRestart: false;
} {
  return {
    recognized: Boolean(label && isApprovedCodexAccountLabel(label)),
    selectable: false,
    canSwitch: false,
    canRestart: false,
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
  if (
    input.readinessExpiresAt == null ||
    input.readinessExpiresAt < input.now
  ) {
    return 'stale';
  }
  return 'verified';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
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

const EMPTY_BINDING: CodexBindingReview = {
  service: SYMPHONY_ELIXIR_SERVICE,
  boundLabel: null,
  recognized: false,
  selectable: false,
  canSwitch: false,
  canRestart: false,
  reviewOnly: true,
  serviceActive: null,
};

export function emptyCodexAccountControlSnapshot(
  availability: Exclude<CodexAccountControlAvailability, 'loading' | 'ready'>,
  error: string | null = null
): CodexAccountControlSnapshot {
  return {
    schema: SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA,
    service: SYMPHONY_ELIXIR_SERVICE,
    observedAt: null,
    availability,
    binding: EMPTY_BINDING,
    accounts: APPROVED_CODEX_ACCOUNT_LABELS.map(label => ({
      label,
      state: 'unknown',
      reconnectEligible: false,
    })),
    session: null,
    error,
  };
}

function parseAccountRow(value: unknown): CodexAccountRow | null {
  if (!isRecord(value)) return null;
  const label = nonEmptyString(value.label);
  if (!label || !isApprovedCodexAccountLabel(label)) return null;
  const state = nonEmptyString(value.state);
  if (
    state !== 'verified' &&
    state !== 'stale' &&
    state !== 'unknown' &&
    state !== 'usage-exhausted'
  ) {
    return null;
  }
  return {
    label,
    state,
    reconnectEligible: value.reconnectEligible !== false,
  };
}

function parseReceipt(value: unknown): CodexReconnectReceipt | null {
  if (!isRecord(value)) return null;
  const account = nonEmptyString(value.account);
  const completedAt = nonEmptyString(value.completedAt);
  if (!account || !isApprovedCodexAccountLabel(account) || !completedAt) {
    return null;
  }
  return {
    schema: SYMPHONY_CODEX_ACCOUNT_RECONNECT_SCHEMA,
    account,
    completedAt,
    source: 'device-auth',
    result: 'selected-account-verified',
  };
}

function parseSession(value: unknown): CodexReconnectSession | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const account = nonEmptyString(value.account);
  const phase = nonEmptyString(value.phase);
  if (!id || !account || !isApprovedCodexAccountLabel(account)) return null;
  if (
    phase !== 'starting' &&
    phase !== 'authorization-pending' &&
    phase !== 'succeeded' &&
    phase !== 'failed' &&
    phase !== 'expired'
  ) {
    return null;
  }
  return {
    id,
    account,
    phase: phase === 'starting' ? 'authorization-pending' : phase,
    userCode: nonEmptyString(value.userCode),
    verificationUri: nonEmptyString(value.verificationUri),
    createdAt: nonEmptyString(value.createdAt) ?? new Date(0).toISOString(),
    expiresAt: nonEmptyString(value.expiresAt) ?? new Date(0).toISOString(),
    receipt: parseReceipt(value.receipt),
    error: nonEmptyString(value.error),
  };
}

export function parseCodexAccountControlSnapshot(
  value: unknown
): CodexAccountControlSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.schema !== SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA) return null;
  const availability =
    value.availability === 'stale' || value.availability === 'unavailable'
      ? value.availability
      : 'ready';
  const bindingRaw = isRecord(value.binding) ? value.binding : null;
  const boundLabel = bindingRaw ? nonEmptyString(bindingRaw.boundLabel) : null;
  const classified = classifyCodexBinding(boundLabel);
  const listed = Array.isArray(value.accounts)
    ? value.accounts
        .map(parseAccountRow)
        .filter((row): row is CodexAccountRow => row !== null)
    : [];
  const byLabel = new Map(listed.map(row => [row.label, row]));
  return {
    schema: SYMPHONY_CODEX_ACCOUNT_CONTROL_SCHEMA,
    service: SYMPHONY_ELIXIR_SERVICE,
    observedAt: nonEmptyString(value.observedAt),
    availability,
    binding: {
      service: SYMPHONY_ELIXIR_SERVICE,
      boundLabel,
      recognized: classified.recognized,
      selectable: false,
      canSwitch: false,
      canRestart: false,
      reviewOnly: true,
      serviceActive:
        bindingRaw?.serviceActive === true
          ? true
          : bindingRaw?.serviceActive === false
            ? false
            : null,
    },
    accounts: APPROVED_CODEX_ACCOUNT_LABELS.map(
      label =>
        byLabel.get(label) ?? {
          label,
          state: 'unknown' as const,
          reconnectEligible: availability === 'ready',
        }
    ),
    session: parseSession(value.session),
    error: nonEmptyString(value.error),
  };
}

export function reconnectPhaseFromSnapshot(
  snapshot: CodexAccountControlSnapshot,
  confirming: ApprovedCodexAccountLabel | null
): CodexReconnectPhase {
  if (confirming) return 'confirmation';
  const phase = snapshot.session?.phase;
  if (
    phase === 'authorization-pending' ||
    phase === 'succeeded' ||
    phase === 'failed' ||
    phase === 'expired'
  ) {
    return phase;
  }
  return 'idle';
}
