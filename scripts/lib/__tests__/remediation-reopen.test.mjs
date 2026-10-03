import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  fileSyntheticMonitoringLinearIssue,
  fingerprintSyntheticFailure,
} from '../../synthetic-monitoring-intake.mjs';

const RED_CALLERS = [
  '.github/workflows/golden-path-nightly.yml',
  'scripts/synthetic-monitoring-intake.mjs',
  'scripts/web-ai-health-intake.mjs',
  'scripts/deprecation-intake.mjs',
  'scripts/observability-issue-linear.mjs',
  'scripts/m2-revenue-path-canary-intake.mjs',
  'scripts/help-center-recertification.mjs',
  'scripts/help-center-visual-assets.mjs',
  'scripts/lib/golden-path-intake.mjs',
  'apps/web/scripts/marketing-certification-producer.ts',
];

describe('red intakes reopen a Done issue', () => {
  it('passes reopenTerminal at every red-run caller', () => {
    for (const path of RED_CALLERS) {
      expect(readFileSync(path, 'utf8'), path).toContain(
        'reopenTerminal: true'
      );
    }
    expect(
      readFileSync('.github/workflows/golden-path-nightly.yml', 'utf8')
    ).toContain('createStateName: "Todo"');
  });

  it('moves a completed synthetic-monitoring issue out of Done', async () => {
    const fingerprint = fingerprintSyntheticFailure('checkout failed');
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('FindIssueByFingerprint')) {
        return new Response(
          JSON.stringify({
            data: {
              team: {
                states: {
                  nodes: [
                    { id: 'state-backlog', name: 'Backlog', type: 'backlog' },
                    { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                  ],
                },
              },
              issues: {
                nodes: [
                  {
                    id: 'lin-1',
                    identifier: 'JOV-1',
                    url: 'https://linear.app/jovie/issue/JOV-1',
                    title: `P0: synthetic monitoring failed (${fingerprint})`,
                    state: {
                      id: 'state-done',
                      name: 'Done',
                      type: 'completed',
                    },
                  },
                ],
              },
            },
          })
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
              issue: {
                id: 'lin-1',
                identifier: 'JOV-1',
                url: 'https://linear.app/jovie/issue/JOV-1',
              },
            },
          },
        })
      );
    });
    const result = await fileSyntheticMonitoringLinearIssue({
      failedTests: 'checkout failed',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      apiKey: 'lin',
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: true, reopened: true });
    const update = JSON.parse(String(fetchImpl.mock.calls[1][1].body));
    expect(update.variables.input.stateId).toBe('state-backlog');
  });
});
