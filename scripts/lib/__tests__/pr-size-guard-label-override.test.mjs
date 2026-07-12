import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSizeGuardOverrideCheckRun,
  buildValidatedSizeGuardCheckRun,
  isSizeGuardOptOutLabel,
  PR_SIZE_GUARD_CHECK_NAME,
  SIZE_GUARD_OPT_OUT_LABELS,
} from '../pr-size-guard-label-override.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SIZE_GUARD_WORKFLOW = resolve(
  REPO_ROOT,
  '.github/workflows/pr-size-guard.yml'
);
const OVERRIDE_WORKFLOW = resolve(
  REPO_ROOT,
  '.github/workflows/pr-size-guard-label-override.yml'
);

describe('pr-size-guard label override helpers', () => {
  it('recognizes only big-pr and codemod as opt-out labels', () => {
    expect(SIZE_GUARD_OPT_OUT_LABELS).toEqual(['big-pr', 'codemod']);
    expect(isSizeGuardOptOutLabel('big-pr')).toBe(true);
    expect(isSizeGuardOptOutLabel('codemod')).toBe(true);
    expect(isSizeGuardOptOutLabel('merge-queue')).toBe(false);
    expect(isSizeGuardOptOutLabel('testing')).toBe(false);
  });

  it('builds a completed success check-run for the PR Size Guard context', () => {
    const payload = buildSizeGuardOverrideCheckRun({
      headSha: 'abc123def456',
      label: 'big-pr',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    });

    expect(payload.name).toBe(PR_SIZE_GUARD_CHECK_NAME);
    expect(payload.head_sha).toBe('abc123def456');
    expect(payload.status).toBe('completed');
    expect(payload.conclusion).toBe('success');
    expect(payload.output.title).toContain('Opt-out');
    expect(payload.output.summary).toContain('`big-pr`');
    expect(payload.output.summary).toContain('not recomputed');
  });

  it('rejects unsupported labels and missing head sha', () => {
    expect(() =>
      buildSizeGuardOverrideCheckRun({
        headSha: 'abc',
        label: 'testing',
        runUrl: 'https://example.com',
      })
    ).toThrow(/unsupported opt-out label/);

    expect(() =>
      buildSizeGuardOverrideCheckRun({
        headSha: '',
        label: 'big-pr',
        runUrl: 'https://example.com',
      })
    ).toThrow(/headSha is required/);
  });

  it('builds a success check only for a recomputed integration-train policy', () => {
    const payload = buildValidatedSizeGuardCheckRun({
      headSha: 'abc123def456',
      policy: 'integration-train',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/2',
    });
    expect(payload.conclusion).toBe('success');
    expect(payload.output.title).toContain('integration train');
    expect(() =>
      buildValidatedSizeGuardCheckRun({
        headSha: 'abc',
        policy: 'big-pr',
        runUrl: '',
      })
    ).toThrow(/unsupported validated policy/);
  });
});

describe('pr-size-guard workflow invariants (JOV-3580 + label override)', () => {
  it('counts files through paginated REST with bounded transient retry', () => {
    const workflow = readFileSync(SIZE_GUARD_WORKFLOW, 'utf8');

    expect(workflow).toContain('gh api --paginate \\');
    expect(workflow).toContain('"repos/$REPO/pulls/$PR/files?per_page=100"');
    expect(workflow).toContain('for attempt in 1 2 3; do');
    expect(workflow).toContain('HTTP 403|HTTP 429|HTTP 5[0-9][0-9]');
    expect(workflow).not.toContain('gh pr view "$PR" -R "$REPO" --json files');
  });

  it('keeps the primary size guard off labeled events', () => {
    const workflow = readFileSync(SIZE_GUARD_WORKFLOW, 'utf8');

    expect(workflow).toContain('types: [opened, synchronize, reopened]');
    expect(workflow).not.toMatch(/types:\s*\[[^\]]*labeled/);
    expect(workflow).toContain(
      'group: pr-size-${{ github.event.pull_request.number }}'
    );
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('JOV-3580');
  });

  it('uses a separate labeled workflow that posts a PR Size Guard check override', () => {
    const workflow = readFileSync(OVERRIDE_WORKFLOW, 'utf8');

    expect(workflow).toContain('types: [labeled]');
    expect(workflow).toContain("github.event.label.name == 'big-pr'");
    expect(workflow).toContain("github.event.label.name == 'codemod'");
    expect(workflow).toContain(
      "github.event.label.name == 'integration-train'"
    );
    expect(workflow).toContain('node scripts/lib/pr-size-guard-policy.mjs');
    expect(workflow).toContain('checks: write');
    expect(workflow).toContain(
      'ref: ${{ github.event.pull_request.base.sha }}'
    );
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain(
      'ref: ${{ github.event.pull_request.head.sha }}'
    );
    expect(workflow).toContain(
      'group: pr-size-label-override-${{ github.event.pull_request.number }}'
    );
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).not.toContain(
      'group: pr-size-${{ github.event.pull_request.number }}'
    );
    expect(workflow).toContain('node scripts/pr-size-guard-label-override.mjs');
    expect(workflow).toContain('JOV-3580');
  });
});
