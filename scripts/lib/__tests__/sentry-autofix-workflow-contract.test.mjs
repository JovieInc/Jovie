import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/sentry-autofix.yml'),
  'utf8'
);
const RECURRENCE = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/sentry-autofix-recurrence.yml'),
  'utf8'
);

describe('Sentry autofix workflow contract', () => {
  it('deduplicates automation by root signature with issue ID fallback', () => {
    const keyExpression =
      '${{ github.event.client_payload.dedupe_key || github.event.client_payload.issue_id }}';

    expect(WORKFLOW).toContain(`group: sentry-autofix-${keyExpression}`);
    expect(WORKFLOW).toContain(`DEDUPE_KEY: ${keyExpression}`);
    expect(WORKFLOW).toContain('BRANCH="sentry-fix/${DEDUPE_KEY}"');
  });

  it('carries release, environment, route, and recurrence evidence into repair', () => {
    for (const field of [
      'root_cause_fingerprint',
      'environment',
      'release',
      'project',
      'route',
      'level',
      'event_id',
      'first_seen',
      'last_seen',
      'event_count',
      'user_count',
    ]) {
      expect(WORKFLOW, `missing client payload field ${field}`).toContain(
        `github.event.client_payload.context.${field}`
      );
    }
  });

  it('requires staged diagnosis and post-deploy recurrence proof', () => {
    expect(WORKFLOW).toContain(
      'Work in these gated stages. Do not advance when the prior stage lacks evidence'
    );
    expect(WORKFLOW).toContain(
      'If customer impact or the current release is ambiguous, make no code change'
    );
    expect(WORKFLOW).toContain(
      'This PR does not close the incident. Resolution requires post-deploy recurrence evidence'
    );
    expect(WORKFLOW).not.toMatch(/close[sd]?\s+(the\s+)?(Sentry\s+)?issue/i);
  });

  it('closes the loop on a scheduled or manual recurrence check, never source PRs', () => {
    expect(RECURRENCE).toMatch(/^\s*schedule:/m);
    expect(RECURRENCE).toContain("cron: '41 * * * *'");
    expect(RECURRENCE).toContain('workflow_dispatch:');
    expect(RECURRENCE).not.toMatch(/^\s*pull_request:/m);
    expect(RECURRENCE).not.toMatch(/^\s*merge_group:/m);
    expect(RECURRENCE).toContain(
      "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'"
    );
    expect(RECURRENCE).toContain('node scripts/sentry-autofix-recurrence.mjs');
    expect(RECURRENCE).toContain('secrets.SENTRY_AUTH_TOKEN');
  });

  it('keeps recurrence off the production-mutation lease with a cost and permission boundary', () => {
    expect(RECURRENCE).toContain('permissions: {}');
    expect(RECURRENCE).toContain('runs-on: ubuntu-latest');
    expect(RECURRENCE).toContain('timeout-minutes: 10');
    expect(RECURRENCE).toContain('group: sentry-autofix-recurrence');
    expect(RECURRENCE).toContain('cancel-in-progress: false');
    expect(RECURRENCE).toContain('permission-contents: read');
    expect(RECURRENCE).toContain('permission-pull-requests: write');
    expect(RECURRENCE).toContain('permission-issues: write');
    expect(RECURRENCE).toContain('persist-credentials: false');
    expect(RECURRENCE).toContain('name: Production – jovie');
    expect(RECURRENCE).not.toContain('group: production-mutation');
    expect(RECURRENCE).not.toContain('permission-contents: write');
    expect(RECURRENCE).not.toContain('id-token: write');
    expect(RECURRENCE).not.toContain('setup-node-pnpm');
    expect(RECURRENCE).not.toContain('jovie-fixed');
  });
});
