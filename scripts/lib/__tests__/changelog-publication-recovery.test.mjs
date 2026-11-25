import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  collectCustomerCandidates,
  fetchCustomerEvidence,
} from '../daily-changelog-collector.mjs';
import { assertPublicationBinding } from '../daily-changelog-publication.mjs';

const sha = 'a'.repeat(40);
const marker = {
  sha,
  deploymentId: 'dpl_1',
  controllerRun: '123',
  controllerAttempt: '1',
  authSmoke: 'not-required',
  terminalReason: 'promoted',
  releasePolicy: {
    schema: 'jovie.release-risk-receipt/v1',
    originalClassification: { requires_smoke: false },
    ovie: {
      rangeRisk: { candidateSha: sha, unknown: false, requiresSmoke: false },
    },
  },
};
const buildInfo = {
  environment: 'production',
  commitSha: sha,
  deploymentId: 'dpl_1',
};
const controller = { verified: true, runId: 123, attempt: 1 };

describe('verified customer publication recovery', () => {
  it('runs after verified releases even if an optional ancestor was skipped', () => {
    const workflow = /** @type {{jobs: Record<string, {if: string}>}} */ (
      load(readFileSync('.github/workflows/production-controller.yml', 'utf8'))
    );
    const job = workflow.jobs['publish-customer-changelog'];
    expect(job.if).toContain('!cancelled()');
    expect(job.if).toContain("needs.production-verified.result == 'success'");
    expect(job.if).toContain("needs.authorize-production.result == 'success'");
    expect(job.if).toContain(
      "needs.production-verified.outputs.verified == 'true'"
    );
    expect(job.if).toContain(
      "needs.authorize-production.outputs.run_web == 'true'"
    );
  });

  it('accepts an exact verified no-smoke-required receipt but rejects missing or contradictory policy', () => {
    expect(() =>
      assertPublicationBinding(marker, buildInfo, controller)
    ).not.toThrow();
    for (const patch of [
      { releasePolicy: undefined },
      {
        releasePolicy: {
          ...marker.releasePolicy,
          originalClassification: { requires_smoke: true },
        },
      },
      {
        releasePolicy: {
          ...marker.releasePolicy,
          ovie: {
            rangeRisk: {
              ...marker.releasePolicy.ovie.rangeRisk,
              unknown: true,
            },
          },
        },
      },
      {
        releasePolicy: {
          ...marker.releasePolicy,
          ovie: {
            rangeRisk: {
              ...marker.releasePolicy.ovie.rangeRisk,
              requiresSmoke: true,
            },
          },
        },
      },
      {
        releasePolicy: {
          ...marker.releasePolicy,
          ovie: {
            rangeRisk: {
              ...marker.releasePolicy.ovie.rangeRisk,
              candidateSha: 'b'.repeat(40),
            },
          },
        },
      },
      { authSmoke: 'failed' },
    ])
      expect(() =>
        assertPublicationBinding({ ...marker, ...patch }, buildInfo, controller)
      ).toThrow();
  });

  it('follows a bounded first-party redirect and preserves the final content', async () => {
    const calls = [];
    const response = await fetchCustomerEvidence(
      'https://jov.ie/tim/take-me-over',
      async url => {
        calls.push(url);
        if (calls.length === 1)
          return {
            status: 308,
            headers: new Headers({ location: '/tim/current' }),
          };
        return { status: 200, ok: true, text: async () => 'Take Me Over' };
      }
    );
    expect(calls).toEqual([
      'https://jov.ie/tim/take-me-over',
      'https://jov.ie/tim/current',
    ]);
    expect(await response.text()).toBe('Take Me Over');
  });

  it('collects a deployed outcome through its approved redirected customer path', async () => {
    const note = {
      issueId: 'JOV-12716',
      outcomeKey: 'legacy-release-links-resolve',
      audience: 'public',
      visibility: 'public',
      releaseWorthy: true,
      section: 'Fixed',
      text: 'Shared release links keep working: Fans can open a release after its address changes.',
      availability: { status: 'ga', prerequisites: [] },
      evidence: [
        { url: 'https://jov.ie/tim/take-me-over', contains: 'Take Me Over' },
      ],
    };
    const candidates = await collectCustomerCandidates({
      markdown: '',
      marker,
      observedAt: '2026-11-19T08:00:00Z',
      git: async (_args, options) => (options?.status ? 0 : 'fix (#25728)'),
      graphql: async () => ({
        data: {
          repository: {
            p25728: {
              number: 25728,
              state: 'MERGED',
              baseRefName: 'main',
              mergeCommit: { oid: sha },
              body: `<!-- customer-changelog/v1 ${JSON.stringify(note)} -->`,
            },
          },
        },
      }),
      fetchPage: async url =>
        url.endsWith('/take-me-over')
          ? { status: 308, headers: new Headers({ location: '/tim/current' }) }
          : { status: 200, ok: true, text: async () => 'Take Me Over' },
    });
    expect(candidates[0]).toMatchObject({
      ancestor: true,
      evidencePassed: true,
      evidenceReceipts: [
        { url: 'https://jov.ie/tim/take-me-over', status: 200, passed: true },
      ],
    });
  });

  it.each([
    'https://evil.example/path',
    'http://jov.ie/path',
    'https://docs.jov.ie/path',
    'https://user@jov.ie/path',
  ])('rejects redirect to %s before requesting it', async location => {
    const calls = [];
    await expect(
      fetchCustomerEvidence('https://jov.ie/start', async url => {
        calls.push(url);
        return { status: 302, headers: new Headers({ location }) };
      })
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('rejects redirect loops within a bounded number of requests', async () => {
    let calls = 0;
    await expect(
      fetchCustomerEvidence('https://jov.ie/start', async () => {
        calls += 1;
        return { status: 308, headers: new Headers({ location: '/start' }) };
      })
    ).rejects.toThrow();
    expect(calls).toBeLessThanOrEqual(6);
  });
});
