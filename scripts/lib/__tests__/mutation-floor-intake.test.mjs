import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isValidRemediationKey } from '../linear-issue-intake.mjs';
import {
  buildMutationFloorIssue,
  buildWorkflowRunUrl,
  fileMutationFloorIssues,
  MUTATION_FLOOR_ISSUE_CAP,
  mutationFloorFingerprint,
  mutationFloorLabelKey,
} from '../mutation-floor-intake.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** A floor breach as reported by evaluateMutationScore via the CLI. */
const failure = {
  file: 'app/api/billing/health/route.ts',
  score: 39.4,
  floor: 38.4,
  valid: 104,
};
const RUN_URL = 'https://github.com/JovieInc/Jovie/actions/runs/39691992741';

describe('mutation floor Linear intake (JOV-8857)', () => {
  it('files one deduped issue per breach through the canonical fingerprint upsert', async () => {
    const upsertIssue = vi.fn().mockResolvedValue({
      ok: true,
      action: 'created',
      url: 'https://linear.app/jovie/issue/JOV-9001',
    });
    const result = await fileMutationFloorIssues({
      failures: [failure],
      runUrl: RUN_URL,
      artifactName: 'mutation-diff-39691992741',
      upsertIssue,
    });

    expect(upsertIssue).toHaveBeenCalledTimes(1);
    const call = upsertIssue.mock.calls[0][0];
    expect(call.fingerprint).toBe(
      'mutation-score-floor:app/api/billing/health/route.ts'
    );
    expect(call.title).toContain(
      'mutation-score-floor:app/api/billing/health/route.ts'
    );
    expect(call.title.length).toBeLessThanOrEqual(240);
    // The issue names the file, measured score, floor, run, and report.
    expect(call.description).toContain('app/api/billing/health/route.ts');
    expect(call.description).toContain('39.4%');
    expect(call.description).toContain('38.4%');
    expect(call.description).toContain(RUN_URL);
    expect(call.description).toContain('mutation-diff-39691992741');
    expect(call.description).toContain('scripts/mutation-score-baseline.json');
    expect(call.priority).toBe(2);
    expect(call.reopenTerminal).toBe(true);
    expect(isValidRemediationKey(call.labelKey)).toBe(true);
    expect(call.labelKey).toBe(mutationFloorLabelKey(failure.file));
    expect(call.labelKey).toBe(
      'mutation-score-floor-app-api-billing-health-route-ts'
    );
    expect(result.filed[0]).toMatchObject({
      file: failure.file,
      ok: true,
      action: 'created',
    });
  });

  it('keeps the fingerprint stable across later red runs at different scores', () => {
    const first = buildMutationFloorIssue({ ...failure, score: 39.4 }, {});
    const later = buildMutationFloorIssue({ ...failure, score: 35.1 }, {});
    expect(later.fingerprint).toBe(first.fingerprint);
    expect(later.title).toContain(mutationFloorFingerprint(failure.file));
    expect(later.title).toContain('35.1%');
  });

  it('dedupes repeated breaches of the same file within one run', async () => {
    const upsertIssue = vi
      .fn()
      .mockResolvedValue({ ok: true, action: 'created' });
    await fileMutationFloorIssues({
      failures: [failure, { ...failure, score: 30 }],
      upsertIssue,
    });
    expect(upsertIssue).toHaveBeenCalledTimes(1);
  });

  it('caps how many issues a single red run can file', async () => {
    const upsertIssue = vi
      .fn()
      .mockResolvedValue({ ok: true, action: 'created' });
    const failures = Array.from(
      { length: MUTATION_FLOOR_ISSUE_CAP + 3 },
      (_, index) => ({
        file: `lib/stripe/breach-${index}.ts`,
        score: 1,
        floor: 2,
      })
    );
    const result = await fileMutationFloorIssues({ failures, upsertIssue });

    expect(upsertIssue).toHaveBeenCalledTimes(MUTATION_FLOOR_ISSUE_CAP);
    expect(result.filed).toHaveLength(MUTATION_FLOOR_ISSUE_CAP);
    expect(result.skipped).toEqual([
      { file: 'lib/stripe/breach-10.ts', reason: 'cap_exceeded' },
      { file: 'lib/stripe/breach-11.ts', reason: 'cap_exceeded' },
      { file: 'lib/stripe/breach-12.ts', reason: 'cap_exceeded' },
    ]);
  });

  it('is a no-op without breaches', async () => {
    const upsertIssue = vi.fn();
    const result = await fileMutationFloorIssues({
      failures: [],
      upsertIssue,
    });

    expect(upsertIssue).not.toHaveBeenCalled();
    expect(result.filed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('honors the REMEDIATION_TRIGGERS_DISABLED kill switch with a dry run', async () => {
    const upsertIssue = vi.fn();
    const result = await fileMutationFloorIssues({
      failures: [failure],
      upsertIssue,
      env: { REMEDIATION_TRIGGERS_DISABLED: 'true' },
    });

    expect(upsertIssue).not.toHaveBeenCalled();
    expect(result.filed).toEqual([]);
    expect(result.dryRun).toBeTruthy();
  });

  it('reports a failed filing without throwing', async () => {
    const upsertIssue = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'missing_linear_api_key' });
    const result = await fileMutationFloorIssues({
      failures: [failure],
      upsertIssue,
    });

    expect(result.filed[0]).toMatchObject({
      file: failure.file,
      ok: false,
      reason: 'missing_linear_api_key',
    });
  });

  it('omits the run and artifact lines when invoked locally', () => {
    const issue = buildMutationFloorIssue(failure, {});
    expect(issue.description).not.toContain('Report artifact');
    expect(issue.description).toContain('unknown run');
  });

  it('builds the workflow run URL from GitHub CI env', () => {
    expect(
      buildWorkflowRunUrl({
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        GITHUB_RUN_ID: '39691992741',
      })
    ).toBe(RUN_URL);
    expect(buildWorkflowRunUrl({ GITHUB_RUN_ID: '39691992741' })).toBeNull();
  });

  it('leaves a scoreless breach readable instead of crashing', () => {
    const issue = buildMutationFloorIssue({ ...failure, score: null }, {});
    expect(issue.title).toContain('n/a');
    expect(issue.description).toContain('n/a');
  });

  it('wires the CLI to file issues only when a floor fails', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'scripts/mutation-diff.mjs'),
      'utf8'
    );
    expect(source).toContain('fileMutationFloorIssues');
    expect(source).toContain('floorFailures.length > 0');
  });
});
