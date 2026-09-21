import { describe, expect, it, vi } from 'vitest';
import {
  fileM2RevenuePathLinearIssue,
  fingerprintM2RevenuePathFailure,
  formatFailedM2Steps,
} from '../../m2-revenue-path-canary-intake.mjs';

describe('m2 revenue-path Linear intake', () => {
  it('fingerprints failed steps and includes JOV-6439 repro', async () => {
    const failed = 'pro_checkout_199: Live pricing options do not include Pro';
    expect(fingerprintM2RevenuePathFailure(failed)).toMatch(
      /^m2-revenue-path:[a-f0-9]{12}$/
    );

    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('FindIssueByFingerprint')) {
        return new Response(
          JSON.stringify({
            data: {
              team: { states: { nodes: [] } },
              issues: { nodes: [] },
            },
          })
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'lin-m2',
                identifier: 'JOV-6440',
                url: 'https://linear.app/jovie/issue/JOV-6440',
              },
            },
          },
        })
      );
    });

    const result = await fileM2RevenuePathLinearIssue({
      receipt: {
        target: 'https://jov.ie',
        repro:
          'pnpm --filter=@jovie/web exec tsx scripts/m2-revenue-path-canary.ts --base-url https://jov.ie',
        steps: [
          { name: 'signed_out', ok: true },
          {
            name: 'pro_checkout_199',
            ok: false,
            detail: 'Live pricing options do not include Pro',
          },
        ],
      },
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      apiKey: 'lin-key',
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      action: 'created',
      identifier: 'JOV-6440',
    });
    const createCall = fetchImpl.mock.calls.find(([, init]) =>
      String(init.body).includes('issueCreate')
    );
    expect(createCall).toBeTruthy();
    const created = JSON.parse(String(createCall[1].body));
    expect(created.variables.title).toContain('m2-revenue-path:');
    expect(created.variables.description).toContain('JOV-6439');
    expect(created.variables.description).toContain('not generic uptime');
    expect(created.variables.description).toContain(
      'tsx scripts/m2-revenue-path-canary.ts'
    );
  });

  it('fails closed without a Linear key', async () => {
    await expect(
      fileM2RevenuePathLinearIssue({
        receipt: { steps: [{ name: 'claim', ok: false, detail: 'missing' }] },
        apiKey: '',
      })
    ).resolves.toEqual({ ok: false, reason: 'missing_linear_api_key' });
  });

  it('formats failed steps for the Linear body', () => {
    expect(
      formatFailedM2Steps({
        steps: [
          { name: 'signed_out', ok: true },
          { name: 'claim', ok: false, detail: 'Pricing page is missing $199' },
        ],
      })
    ).toBe('claim: Pricing page is missing $199');
  });
});
