import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LinearRequestError,
  LinearUnavailableError,
  openLinearIssueWithReadback,
} from '../agent/lib/linear-client';
import {
  bindEvePilotIdentity,
  EvePilotCapabilityDeniedError,
} from '../agent/select-identity';
import { linearIssueTool } from '../agent/tools/linear_issue';

// The materialized Summer app has one fixed identity: binding another
// identity throws cross-domain before any capability check, and the runtime
// ignores EVE_IDENTITY. The pilot source repo can bind both identities.
const isMaterializedSummerApp = existsSync(
  new URL('../agent/runtime-identity.ts', import.meta.url)
);

const BASE_INPUT = {
  teamKey: 'jov',
  title: 'Track summer Linear coordination write fix',
  description: 'Ad-hoc verification issue for the summer Linear write path.',
  founderIntent:
    'Tim authorized Summer to open Linear issues for coordination tracking.',
  sourceRef: 'imessage-thread-receipt-2026-09-21',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type CallLog = { query: string; variables: Record<string, unknown> };

function fetchScript(
  calls: CallLog[],
  handler: (call: CallLog, index: number) => Response
): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const call = { query: parsed.query, variables: parsed.variables };
    return handler(call, calls.push(call) - 1);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('openLinearIssueWithReadback', () => {
  it('is unavailable without a configured API key', async () => {
    await expect(
      openLinearIssueWithReadback(BASE_INPUT, { environment: {} })
    ).rejects.toBeInstanceOf(LinearUnavailableError);
  });

  it('creates the issue and verifies the readback before returning a receipt', async () => {
    const calls: CallLog[] = [];
    const fetchImpl = fetchScript(calls, (call, index) => {
      if (call.query.includes('teams(filter:')) {
        return jsonResponse({
          data: { teams: { nodes: [{ id: 'team-uuid-1', key: 'JOV' }] } },
        });
      }
      if (call.query.includes('issueCreate')) {
        return jsonResponse({
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'issue-uuid-1', identifier: 'JOV-1234' },
            },
          },
        });
      }
      if (call.query.includes('issues(')) {
        expect(call.variables).toMatchObject({
          teamKey: 'JOV',
          number: 1234,
        });
        return jsonResponse({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue-uuid-1',
                  identifier: 'JOV-1234',
                  title: BASE_INPUT.title,
                  url: 'https://linear.app/jovie/issue/JOV-1234',
                },
              ],
            },
          },
        });
      }
      throw new Error(`unexpected call ${index}`);
    });

    const receipt = await openLinearIssueWithReadback(BASE_INPUT, {
      fetchImpl,
      environment: { LINEAR_API_KEY: 'lin_api_test' },
    });

    expect(calls).toHaveLength(3);
    expect(receipt.readbackVerified).toBe(true);
    expect(receipt.issue.identifier).toBe('JOV-1234');
    expect(receipt.issue.url).toContain('JOV-1234');
    expect(receipt.provenance).toEqual({
      founderIntent: BASE_INPUT.founderIntent,
      sourceRef: BASE_INPUT.sourceRef,
    });
  });

  it('fails closed when the readback does not match the created issue', async () => {
    const calls: CallLog[] = [];
    const fetchImpl = fetchScript(calls, call => {
      if (call.query.includes('teams(filter:')) {
        return jsonResponse({
          data: { teams: { nodes: [{ id: 'team-uuid-1', key: 'JOV' }] } },
        });
      }
      if (call.query.includes('issueCreate')) {
        return jsonResponse({
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'issue-uuid-1', identifier: 'JOV-1234' },
            },
          },
        });
      }
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              {
                id: 'issue-uuid-OTHER',
                identifier: 'JOV-9999',
                title: 'other',
                url: 'https://linear.app/jovie/issue/JOV-9999',
              },
            ],
          },
        },
      });
    });

    await expect(
      openLinearIssueWithReadback(BASE_INPUT, {
        fetchImpl,
        environment: { LINEAR_API_KEY: 'lin_api_test' },
      })
    ).rejects.toBeInstanceOf(LinearRequestError);
  });

  it('classifies auth failures as auth errors', async () => {
    const stubbed = (async (_url: unknown, init?: RequestInit) => {
      void JSON.parse(String(init?.body));
      return jsonResponse({}, 401);
    }) as unknown as typeof fetch;
    await expect(
      openLinearIssueWithReadback(BASE_INPUT, {
        fetchImpl: stubbed,
        environment: { LINEAR_API_KEY: 'lin_api_test' },
      })
    ).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('linear_issue tool session availability', () => {
  it.each(['session.started', 'turn.started'] as const)(
    'exposes the tool at %s only for Summer-identity sessions',
    async lifecycle => {
      const { default: definition, linearIssueTool } = await import(
        '../agent/tools/linear_issue'
      );
      const resolver = definition.events[lifecycle]!;
      const context = (attributes: Record<string, string>) =>
        ({
          session: { id: 'ses_test', auth: { current: { attributes } } },
          channel: {},
          messages: [],
        }) as Parameters<typeof resolver>[1];
      expect(await resolver({}, context({ identity: 'summer' }))).toBe(
        linearIssueTool
      );
      expect(await resolver({}, context({ identity: 'jovie' }))).toBeNull();
      expect(await resolver({}, context({}))).toBeNull();
    }
  );
});

describe('linear coordination capability boundary', () => {
  it('denies the jovie identity and admits summer', () => {
    expect(() =>
      bindEvePilotIdentity('summer').require('linear-coordination-write')
    ).not.toThrow();
    if (isMaterializedSummerApp) {
      // The built Summer app is single-identity: cross-domain binding is
      // rejected before any capability check.
      expect(() => bindEvePilotIdentity('jovie')).toThrow(/cross-domain/);
    } else {
      expect(() =>
        bindEvePilotIdentity('jovie').require('linear-coordination-write')
      ).toThrow(EvePilotCapabilityDeniedError);
    }
  });
});

describe('linear_issue tool', () => {
  const input = {
    teamKey: 'JOV',
    title: 'Track summer Linear coordination write fix',
    description: 'Ad-hoc verification issue for the summer Linear write path.',
    founderIntent:
      'Tim authorized Summer to open Linear issues for coordination tracking.',
    sourceRef: 'imessage-thread-receipt-2026-09-21',
  };

  it('denies the tool outside the summer runtime', async () => {
    vi.stubEnv('EVE_IDENTITY', 'jovie');
    const result = await linearIssueTool.execute(input);
    if (isMaterializedSummerApp) {
      // Single-identity runtime: a foreign EVE_IDENTITY fails closed at the
      // application boundary, and the capability gate itself never admits it.
      expect(result).toEqual({
        ok: false,
        code: 'runtime_identity_unavailable',
      });
    } else {
      expect(result).toEqual({ ok: false, code: 'capability_denied' });
    }
  });

  it('reports linear_unconfigured instead of claiming a write when no key exists', async () => {
    vi.stubEnv('EVE_IDENTITY', 'summer');
    vi.stubEnv('LINEAR_API_KEY', '');
    const result = await linearIssueTool.execute(input);
    expect(result).toEqual({ ok: false, code: 'linear_unconfigured' });
  });

  it('returns a readback-verified receipt on the happy path', async () => {
    vi.stubEnv('EVE_IDENTITY', 'summer');
    vi.stubEnv('LINEAR_API_KEY', 'lin_api_test');
    const stubbed = (async (_url: unknown, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body)) as { query: string };
      if (parsed.query.includes('teams(filter:')) {
        return jsonResponse({
          data: { teams: { nodes: [{ id: 'team-uuid-1', key: 'JOV' }] } },
        });
      }
      if (parsed.query.includes('issueCreate')) {
        return jsonResponse({
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'issue-uuid-1', identifier: 'JOV-1234' },
            },
          },
        });
      }
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              {
                id: 'issue-uuid-1',
                identifier: 'JOV-1234',
                title: input.title,
                url: 'https://linear.app/jovie/issue/JOV-1234',
              },
            ],
          },
        },
      });
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', stubbed);
    const result = await linearIssueTool.execute(input);
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        readbackVerified: true,
        issue: { identifier: 'JOV-1234' },
      },
    });
  });
});
