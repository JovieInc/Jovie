export interface CiFailureDiagnosis {
  readonly id: string;
  readonly classification: 'broken-e2e-fixture';
  readonly retryable: false;
  readonly rootCause: string;
  readonly remediation: string;
}

const SYNTHETIC_AUTH_ACTOR = /\b(?:user_test|ba_dev_[a-z0-9_-]+)\b/i;
const POSTGRES_INVALID_UUID_VALUE =
  /invalid input syntax for type uuid:\s*["']([^"']+)["']/gi;
const LEGACY_BETTER_AUTH_USER_INSERT =
  /failed query:\s*insert into ["']?ba_users["']?[^\r\n]*\r?\nparams:\s*(ba_dev_[a-z0-9_-]+)(?:,|\s|$)/i;

export interface KnownCiFlake {
  readonly id: string;
  readonly workflow: string;
  readonly pattern: string;
  readonly note: string;
}

function hasInvalidSyntheticActor(log: string): boolean {
  return [...log.matchAll(POSTGRES_INVALID_UUID_VALUE)].some(match =>
    SYNTHETIC_AUTH_ACTOR.test(match[1] ?? '')
  );
}

/** Deterministic Gem diagnosis for failures that must be repaired, not retried. */
export function classifyCiFailure(log: string): CiFailureDiagnosis | null {
  const invalidSyntheticActor = hasInvalidSyntheticActor(log);
  const legacyBetterAuthInsert = LEGACY_BETTER_AUTH_USER_INSERT.test(log);
  if (!invalidSyntheticActor && !legacyBetterAuthInsert) {
    return null;
  }

  return {
    id: 'postgres-synthetic-auth-actor-uuid',
    classification: 'broken-e2e-fixture',
    retryable: false,
    rootCause: legacyBetterAuthInsert
      ? 'A legacy ba_dev_* Better Auth fixture id was written to the UUID-backed ba_users.id column, so persisted E2E actor provisioning failed before session creation.'
      : 'A synthetic Better Auth actor label reached a PostgreSQL UUID predicate because the E2E session was not provisioned as a persisted app user.',
    remediation: legacyBetterAuthInsert
      ? 'Generate the persisted test actor with the deterministic UUID mapping and provision it through POST /api/dev/test-auth/session; do not retry until the fixture is repaired or reprovisioned.'
      : 'Provision the actor through POST /api/dev/test-auth/session and fail closed when an existing actor cannot be resolved; do not retry until the fixture is repaired or reprovisioned.',
  };
}

export function classifyKnownCiFlake(
  log: string,
  workflowName: string,
  flakes: ReadonlyArray<KnownCiFlake>
): KnownCiFlake | null {
  if (classifyCiFailure(log)) return null;

  for (const flake of flakes) {
    if (flake.workflow !== '*' && flake.workflow !== workflowName) continue;
    try {
      if (new RegExp(flake.pattern, 'i').test(log)) return flake;
    } catch {
      // Invalid known-flake patterns must not hide an otherwise unknown failure.
    }
  }
  return null;
}
