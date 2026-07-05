import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildQuarantineLedgerSummary,
  formatQuarantineValidationReport,
  isQuarantineLedgerValid,
  parseQuarantineLedger,
} from '@/lib/testing/quarantine-ledger';

describe('quarantine ledger', () => {
  it('parses the committed ledger file with required metadata', () => {
    const ledgerPath = resolve(process.cwd(), 'tests/quarantine.json');
    const parsed = parseQuarantineLedger(
      JSON.parse(readFileSync(ledgerPath, 'utf8'))
    );

    expect(isQuarantineLedgerValid(parsed)).toBe(true);

    // Count entries dynamically so the test tolerates additions/removals in
    // tests/quarantine.json — only the structural guarantees matter here.
    const expectedUnitCount = parsed.ledger.entries.filter(
      entry => entry.kind === 'unit'
    ).length;
    const expectedE2eCount = parsed.ledger.entries.filter(
      entry => entry.kind === 'e2e'
    ).length;

    expect(parsed.ledger.entries.length).toBeGreaterThan(0);
    expect(parsed.unitPaths).toHaveLength(expectedUnitCount);
    expect(parsed.e2ePaths).toHaveLength(expectedE2eCount);
    expect(parsed.summary.withinRetryBudget).toBe(true);
  });

  it('flags missing required entry metadata', () => {
    const parsed = parseQuarantineLedger({
      schemaVersion: 1,
      retryBudget: {
        unitDefaultRetries: 1,
        quarantineUnitRetries: 2,
        e2eDefaultRetries: 0,
        quarantineE2eRetries: 2,
        maxRetryAttemptsPerCiRun: 10,
        unitShardCount: 6,
      },
      entries: [
        {
          id: 'broken-entry',
          kind: 'unit',
          path: 'tests/foo.test.ts',
          owner: '',
          firstSeenAt: '2026-02-01',
          reproductionCommand: 'pnpm test',
          fixIssueUrl: 'https://linear.app/jovie/issue/JOV-1',
          expiresAt: '2026-12-31',
        },
      ],
    });

    expect(isQuarantineLedgerValid(parsed)).toBe(false);
    expect(parsed.issues.some(issue => issue.path.includes('owner'))).toBe(
      true
    );
  });

  it('enforces retry budget caps', () => {
    const parsed = parseQuarantineLedger({
      schemaVersion: 1,
      retryBudget: {
        unitDefaultRetries: 1,
        quarantineUnitRetries: 5,
        e2eDefaultRetries: 0,
        quarantineE2eRetries: 5,
        maxRetryAttemptsPerCiRun: 10,
        unitShardCount: 6,
      },
      entries: Array.from({ length: 4 }, (_, index) => ({
        id: `unit-${index}`,
        kind: 'unit',
        path: `tests/foo-${index}.test.ts`,
        owner: 'platform',
        firstSeenAt: '2026-02-01',
        reproductionCommand: 'pnpm test',
        fixIssueUrl: 'https://linear.app/jovie/issue/JOV-1',
        expiresAt: '2026-12-31',
      })),
    });

    expect(parsed.summary.withinRetryBudget).toBe(false);
    expect(
      parsed.issues.some(issue =>
        issue.path.includes('maxRetryAttemptsPerCiRun')
      )
    ).toBe(true);
  });

  it('summarizes active vs expired entries', () => {
    const summary = buildQuarantineLedgerSummary({
      entries: [
        {
          id: 'active',
          kind: 'unit',
          path: 'tests/active.test.ts',
          owner: 'platform',
          firstSeenAt: '2026-02-01',
          reproductionCommand: 'pnpm test',
          fixIssueUrl: 'https://linear.app/jovie/issue/JOV-1',
          expiresAt: '2099-01-01',
        },
        {
          id: 'expired',
          kind: 'e2e',
          path: 'apps/web/tests/e2e/expired.spec.ts',
          owner: 'platform',
          firstSeenAt: '2026-02-01',
          reproductionCommand: 'pnpm playwright test',
          fixIssueUrl: 'https://linear.app/jovie/issue/JOV-2',
          expiresAt: '2020-01-01',
        },
      ],
      retryBudget: {
        unitDefaultRetries: 1,
        quarantineUnitRetries: 2,
        e2eDefaultRetries: 0,
        quarantineE2eRetries: 2,
        maxRetryAttemptsPerCiRun: 120,
        unitShardCount: 6,
      },
      now: new Date('2026-06-13T00:00:00.000Z'),
    });

    expect(summary.activeCount).toBe(1);
    expect(summary.expiredCount).toBe(1);
    expect(summary.unitCount).toBe(1);
    expect(summary.e2eCount).toBe(0);
  });

  it('formats a validation report', () => {
    const parsed = parseQuarantineLedger({ entries: [] });
    expect(formatQuarantineValidationReport(parsed)).toContain(
      'Quarantine ledger is valid'
    );
  });
});
