export type QuarantineEntryKind = 'unit' | 'e2e';

export interface QuarantineRetryBudget {
  /** Retries for the default (non-quarantine) unit lane. */
  readonly unitDefaultRetries: number;
  /** Retries for quarantined unit specs. */
  readonly quarantineUnitRetries: number;
  /** Retries for the default (non-quarantine) E2E lane. */
  readonly e2eDefaultRetries: number;
  /** Retries for quarantined E2E specs. */
  readonly quarantineE2eRetries: number;
  /**
   * Upper bound on total retry attempts budgeted per CI run.
   * Computed as: unit shard count * unitDefaultRetries + sum(quarantine retries).
   */
  readonly maxRetryAttemptsPerCiRun: number;
  /** Number of unit-test shards in CI (used for budget estimation). */
  readonly unitShardCount: number;
}

export interface QuarantineLedgerEntry {
  readonly id: string;
  readonly kind: QuarantineEntryKind;
  /** Unit paths are relative to apps/web; E2E paths are repo-root relative. */
  readonly path: string;
  readonly owner: string;
  readonly firstSeenAt: string;
  readonly reproductionCommand: string;
  readonly fixIssueUrl: string;
  readonly expiresAt: string;
  readonly consecutiveSuccesses?: number;
}

export interface QuarantineLedger {
  readonly schemaVersion: 1;
  readonly retryBudget: QuarantineRetryBudget;
  readonly entries: readonly QuarantineLedgerEntry[];
}

export interface LegacyQuarantineFile {
  readonly unit?: readonly string[];
  readonly e2e?: readonly string[];
}

export interface QuarantineLedgerValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface QuarantineLedgerSummary {
  readonly activeCount: number;
  readonly expiredCount: number;
  readonly unitCount: number;
  readonly e2eCount: number;
  readonly estimatedRetryAttemptsPerRun: number;
  readonly retryBudgetCap: number;
  readonly retryBudgetUsagePercent: number;
  readonly withinRetryBudget: boolean;
  readonly expiringSoonCount: number;
}

export interface ParsedQuarantineLedger {
  readonly ledger: QuarantineLedger;
  readonly unitPaths: readonly string[];
  readonly e2ePaths: readonly string[];
  readonly summary: QuarantineLedgerSummary;
  readonly issues: readonly QuarantineLedgerValidationIssue[];
}

const REQUIRED_ENTRY_FIELDS: readonly (keyof QuarantineLedgerEntry)[] = [
  'id',
  'kind',
  'path',
  'owner',
  'firstSeenAt',
  'reproductionCommand',
  'fixIssueUrl',
  'expiresAt',
];

const DEFAULT_RETRY_BUDGET: QuarantineRetryBudget = {
  unitDefaultRetries: 1,
  quarantineUnitRetries: 2,
  e2eDefaultRetries: 0,
  quarantineE2eRetries: 2,
  maxRetryAttemptsPerCiRun: 120,
  unitShardCount: 6,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isQuarantineKind(value: unknown): value is QuarantineEntryKind {
  return value === 'unit' || value === 'e2e';
}

function normalizeRetryBudget(
  value: unknown
): QuarantineRetryBudget & { issues: QuarantineLedgerValidationIssue[] } {
  const issues: QuarantineLedgerValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ...DEFAULT_RETRY_BUDGET, issues };
  }

  const readNumber = (
    key: keyof QuarantineRetryBudget,
    fallback: number,
    min = 0
  ): number => {
    const raw = value[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min) {
      issues.push({
        path: `retryBudget.${key}`,
        message: `Expected number >= ${min}`,
      });
      return fallback;
    }
    return raw;
  };

  return {
    unitDefaultRetries: readNumber('unitDefaultRetries', 1),
    quarantineUnitRetries: readNumber('quarantineUnitRetries', 2),
    e2eDefaultRetries: readNumber('e2eDefaultRetries', 0),
    quarantineE2eRetries: readNumber('quarantineE2eRetries', 2),
    maxRetryAttemptsPerCiRun: readNumber('maxRetryAttemptsPerCiRun', 120, 1),
    unitShardCount: readNumber('unitShardCount', 6, 1),
    issues,
  };
}

function legacyEntry(
  kind: QuarantineEntryKind,
  path: string,
  index: number
): QuarantineLedgerEntry {
  const slug = path
    .replace(/^apps\/web\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return {
    id: `legacy-${kind}-${index}-${slug || 'entry'}`,
    kind,
    path,
    owner: 'platform',
    firstSeenAt: '2026-01-01',
    reproductionCommand:
      kind === 'unit'
        ? `pnpm --filter @jovie/web exec vitest run ${path}`
        : `cd apps/web && pnpm playwright test ${path.replace(/^apps\/web\//, '')}`,
    fixIssueUrl: 'https://linear.app/jovie/issue/JOV-782',
    expiresAt: '2026-12-31',
  };
}

export function parseQuarantineLedger(raw: unknown): ParsedQuarantineLedger {
  const issues: QuarantineLedgerValidationIssue[] = [];

  if (!isRecord(raw)) {
    return {
      ledger: {
        schemaVersion: 1,
        retryBudget: DEFAULT_RETRY_BUDGET,
        entries: [],
      },
      unitPaths: [],
      e2ePaths: [],
      summary: buildQuarantineLedgerSummary({
        entries: [],
        retryBudget: DEFAULT_RETRY_BUDGET,
      }),
      issues: [{ path: 'root', message: 'Expected JSON object' }],
    };
  }

  const retryBudgetResult = normalizeRetryBudget(raw.retryBudget);
  issues.push(...retryBudgetResult.issues);

  const entries: QuarantineLedgerEntry[] = [];

  if (Array.isArray(raw.entries)) {
    raw.entries.forEach((entry, index) => {
      if (!isRecord(entry)) {
        issues.push({
          path: `entries[${index}]`,
          message: 'Expected object',
        });
        return;
      }

      for (const field of REQUIRED_ENTRY_FIELDS) {
        if (!isNonEmptyString(entry[field])) {
          issues.push({
            path: `entries[${index}].${field}`,
            message: 'Required non-empty string',
          });
        }
      }

      if (!isQuarantineKind(entry.kind)) {
        issues.push({
          path: `entries[${index}].kind`,
          message: 'Expected "unit" or "e2e"',
        });
      }

      if (
        isNonEmptyString(entry.firstSeenAt) &&
        !isIsoDate(entry.firstSeenAt)
      ) {
        issues.push({
          path: `entries[${index}].firstSeenAt`,
          message: 'Expected ISO date',
        });
      }

      if (isNonEmptyString(entry.expiresAt) && !isIsoDate(entry.expiresAt)) {
        issues.push({
          path: `entries[${index}].expiresAt`,
          message: 'Expected ISO date',
        });
      }

      if (
        isQuarantineKind(entry.kind) &&
        isNonEmptyString(entry.path) &&
        entry.kind === 'unit' &&
        entry.path.startsWith('apps/web/')
      ) {
        issues.push({
          path: `entries[${index}].path`,
          message: 'Unit paths must be relative to apps/web',
        });
      }

      if (
        isQuarantineKind(entry.kind) &&
        isNonEmptyString(entry.path) &&
        entry.kind === 'e2e' &&
        !entry.path.startsWith('apps/web/')
      ) {
        issues.push({
          path: `entries[${index}].path`,
          message: 'E2E paths must be repo-root relative (apps/web/...)',
        });
      }

      const id = entry.id;
      const kind = entry.kind;
      const path = entry.path;
      const owner = entry.owner;
      const firstSeenAt = entry.firstSeenAt;
      const reproductionCommand = entry.reproductionCommand;
      const fixIssueUrl = entry.fixIssueUrl;
      const expiresAt = entry.expiresAt;

      if (
        isQuarantineKind(kind) &&
        isNonEmptyString(id) &&
        isNonEmptyString(path) &&
        isNonEmptyString(owner) &&
        isNonEmptyString(firstSeenAt) &&
        isNonEmptyString(reproductionCommand) &&
        isNonEmptyString(fixIssueUrl) &&
        isNonEmptyString(expiresAt)
      ) {
        entries.push({
          id: id.trim(),
          kind,
          path: path.trim(),
          owner: owner.trim(),
          firstSeenAt: firstSeenAt.trim(),
          reproductionCommand: reproductionCommand.trim(),
          fixIssueUrl: fixIssueUrl.trim(),
          expiresAt: expiresAt.trim(),
          consecutiveSuccesses:
            typeof entry.consecutiveSuccesses === 'number'
              ? entry.consecutiveSuccesses
              : 0,
        });
      }
    });
  } else if (Array.isArray(raw.unit) || Array.isArray(raw.e2e)) {
    const legacy = raw as LegacyQuarantineFile;
    (legacy.unit ?? []).forEach((path, index) => {
      entries.push(legacyEntry('unit', path, index));
    });
    (legacy.e2e ?? []).forEach((path, index) => {
      entries.push(legacyEntry('e2e', path, index));
    });
    issues.push({
      path: 'entries',
      message:
        'Legacy unit/e2e arrays detected — migrate to schemaVersion 1 entries with owner metadata',
    });
  } else {
    issues.push({
      path: 'entries',
      message: 'Expected entries array',
    });
  }

  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      issues.push({
        path: `entries.${entry.id}`,
        message: 'Duplicate entry id',
      });
    }
    ids.add(entry.id);
  }

  const retryBudget: QuarantineRetryBudget = {
    unitDefaultRetries: retryBudgetResult.unitDefaultRetries,
    quarantineUnitRetries: retryBudgetResult.quarantineUnitRetries,
    e2eDefaultRetries: retryBudgetResult.e2eDefaultRetries,
    quarantineE2eRetries: retryBudgetResult.quarantineE2eRetries,
    maxRetryAttemptsPerCiRun: retryBudgetResult.maxRetryAttemptsPerCiRun,
    unitShardCount: retryBudgetResult.unitShardCount,
  };

  const ledger: QuarantineLedger = {
    schemaVersion: 1,
    retryBudget,
    entries,
  };

  const summary = buildQuarantineLedgerSummary({
    entries,
    retryBudget,
  });

  if (!summary.withinRetryBudget) {
    issues.push({
      path: 'retryBudget.maxRetryAttemptsPerCiRun',
      message: `Estimated retry attempts (${summary.estimatedRetryAttemptsPerRun}) exceed cap (${summary.retryBudgetCap})`,
    });
  }

  const unitPaths = entries
    .filter(entry => entry.kind === 'unit')
    .map(entry => entry.path);
  const e2ePaths = entries
    .filter(entry => entry.kind === 'e2e')
    .map(entry => entry.path);

  return {
    ledger,
    unitPaths,
    e2ePaths,
    summary,
    issues,
  };
}

export function buildQuarantineLedgerSummary(input: {
  readonly entries: readonly QuarantineLedgerEntry[];
  readonly retryBudget: QuarantineRetryBudget;
  readonly now?: Date;
}): QuarantineLedgerSummary {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const soonThresholdMs = 14 * 24 * 60 * 60 * 1000;

  let activeCount = 0;
  let expiredCount = 0;
  let expiringSoonCount = 0;
  let unitCount = 0;
  let e2eCount = 0;

  for (const entry of input.entries) {
    const expiresMs = Date.parse(entry.expiresAt);
    const isExpired = !Number.isNaN(expiresMs) && expiresMs < nowMs;

    if (isExpired) {
      expiredCount += 1;
      continue;
    }

    activeCount += 1;
    if (entry.kind === 'unit') unitCount += 1;
    if (entry.kind === 'e2e') e2eCount += 1;

    if (!Number.isNaN(expiresMs) && expiresMs - nowMs <= soonThresholdMs) {
      expiringSoonCount += 1;
    }
  }

  const quarantineUnitRetries =
    unitCount * input.retryBudget.quarantineUnitRetries;
  const quarantineE2eRetries =
    e2eCount * input.retryBudget.quarantineE2eRetries;
  const defaultUnitRetries =
    input.retryBudget.unitShardCount * input.retryBudget.unitDefaultRetries;

  const estimatedRetryAttemptsPerRun =
    defaultUnitRetries + quarantineUnitRetries + quarantineE2eRetries;
  const retryBudgetCap = input.retryBudget.maxRetryAttemptsPerCiRun;
  const retryBudgetUsagePercent =
    retryBudgetCap > 0
      ? Math.min(100, (estimatedRetryAttemptsPerRun / retryBudgetCap) * 100)
      : 0;

  return {
    activeCount,
    expiredCount,
    unitCount,
    e2eCount,
    estimatedRetryAttemptsPerRun,
    retryBudgetCap,
    retryBudgetUsagePercent,
    withinRetryBudget: estimatedRetryAttemptsPerRun <= retryBudgetCap,
    expiringSoonCount,
  };
}

export function isQuarantineLedgerValid(
  parsed: ParsedQuarantineLedger
): boolean {
  return parsed.issues.length === 0;
}

export function formatQuarantineValidationReport(
  parsed: ParsedQuarantineLedger
): string {
  if (parsed.issues.length === 0) {
    return [
      'Quarantine ledger is valid.',
      `Active entries: ${parsed.summary.activeCount}`,
      `Retry budget: ${parsed.summary.estimatedRetryAttemptsPerRun}/${parsed.summary.retryBudgetCap} (${parsed.summary.retryBudgetUsagePercent.toFixed(1)}%)`,
    ].join('\n');
  }

  return parsed.issues
    .map(issue => `${issue.path}: ${issue.message}`)
    .join('\n');
}
