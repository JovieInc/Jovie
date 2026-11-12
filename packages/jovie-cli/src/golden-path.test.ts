import { describe, expect, it } from 'vitest';

import { runCli } from './cli.js';
import { JovieInputError, JovieRequestError } from './client.js';
import { findCommand } from './commands.js';
import {
  answerOnboardingQuestion,
  buildProfile,
  claimHandle,
  draftRef,
  getQualification,
  publishProfile,
  shareProfile,
  startUpgrade,
} from './golden-path.js';

const DRAFT_ID = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const REF_FLAGS = {
  'draft-id': DRAFT_ID,
  'draft-token': 'g'.repeat(120),
};

function mcpFetch(result: unknown, isError = false) {
  return async (
    input: string | URL,
    _init?: RequestInit
  ): Promise<Response> => {
    const body = await new Response(
      JSON.stringify(
        result === undefined
          ? {
              jsonrpc: '2.0',
              id: 'jovie-golden-path',
              error: { code: -1, message: 'x' },
            }
          : {
              jsonrpc: '2.0',
              id: 'jovie-golden-path',
              result: {
                content: [{ type: 'text', text: JSON.stringify(result) }],
                structuredContent: result,
                isError,
              },
            }
      )
    ).text();
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('command table registration', () => {
  it('registers the seven golden-path commands', () => {
    for (const [first, second] of [
      ['claim', 'handle'],
      ['onboarding', 'answer'],
      ['onboarding', 'qualify'],
      ['onboarding', 'setup'],
      ['onboarding', 'publish'],
      ['profile', 'share'],
      ['profile', 'upgrade'],
    ]) {
      expect(findCommand([first, second]), `${first} ${second}`).toBeTruthy();
    }
  });
});

describe('golden-path CLI dispatch', () => {
  const ref = { draft_id: DRAFT_ID, draft_token: REF_FLAGS['draft-token'] };
  const cases = [
    {
      path: ['claim', 'handle', 'radiohead'],
      tool: 'claim_handle',
      args: { ...ref, handle: 'radiohead' },
    },
    {
      path: [
        'onboarding',
        'answer',
        '--question',
        'promoSpend',
        '--answer',
        'under_50',
      ],
      tool: 'answer_onboarding_question',
      args: { ...ref, question: 'promoSpend', answer: 'under_50' },
    },
    { path: ['onboarding', 'qualify'], tool: 'get_qualification', args: ref },
    { path: ['onboarding', 'setup'], tool: 'build_profile', args: ref },
    { path: ['onboarding', 'publish'], tool: 'publish_profile', args: ref },
    {
      path: ['profile', 'share', 'radiohead'],
      tool: 'share_profile',
      args: { username: 'radiohead' },
    },
    { path: ['profile', 'upgrade'], tool: 'start_upgrade', args: ref },
  ];

  it.each(cases)(
    'dispatches $tool and prints its result',
    async ({ path, tool, args }) => {
      const calls: unknown[] = [];
      let stdout = '';
      let stderr = '';
      const result = { status: 'ok', tool };
      const flags =
        tool === 'share_profile'
          ? []
          : ['--draft-id', DRAFT_ID, '--draft-token', REF_FLAGS['draft-token']];
      const code = await runCli([...path, ...flags, '--json'], {
        stdout: {
          write: chunk => {
            stdout += chunk;
          },
        },
        stderr: {
          write: chunk => {
            stderr += chunk;
          },
        },
        fetchImpl: async (input, init) => {
          expect(String(input)).toBe('https://jov.ie/api/mcp');
          expect(init?.method).toBe('POST');
          calls.push(JSON.parse(String(init?.body)));
          return mcpFetch(result)(input, init);
        },
      });
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(JSON.parse(stdout)).toEqual(result);
      expect(calls).toEqual([
        {
          jsonrpc: '2.0',
          id: 'jovie-golden-path',
          method: 'tools/call',
          params: { name: tool, arguments: args },
        },
      ]);
    }
  );

  it.each(cases)(
    'rejects missing inputs for $tool before requesting',
    async ({ path, tool }) => {
      let calls = 0;
      let stdout = '';
      const code = await runCli([...path.slice(0, 2), '--json'], {
        stdout: {
          write: chunk => {
            stdout += chunk;
          },
        },
        fetchImpl: async () => {
          calls++;
          return Response.json({});
        },
      });
      expect(code).toBe(2);
      expect(JSON.parse(stdout).error.code).toBe(
        tool === 'claim_handle' || tool === 'share_profile'
          ? 'USAGE_ERROR'
          : 'INVALID_INPUT'
      );
      expect(calls).toBe(0);
    }
  );

  it.each(cases.filter(({ tool }) => tool !== 'share_profile'))(
    'rejects an absent draft capability in the $tool handler',
    async ({ path }) => {
      const command = findCommand(path)!;
      let calls = 0;
      await expect(async () =>
        command.run(
          { arg: 'radiohead' },
          {
            fetchImpl: async () => {
              calls++;
              return Response.json({});
            },
          }
        )
      ).rejects.toBeInstanceOf(JovieInputError);
      expect(calls).toBe(0);
    }
  );
});

describe('draftRef', () => {
  it('shapes the capability pair for the MCP call', () => {
    expect(draftRef(REF_FLAGS)).toEqual({
      draft_id: DRAFT_ID,
      draft_token: 'g'.repeat(120),
    });
  });

  it('fails closed without a valid draft id or token', () => {
    expect(() => draftRef({ 'draft-id': 'nope', 'draft-token': 'x' })).toThrow(
      JovieInputError
    );
    expect(() =>
      draftRef({ 'draft-id': DRAFT_ID, 'draft-token': ' ' })
    ).toThrow(JovieInputError);
  });
});

describe('golden-path tool calls', () => {
  it('claim_handle posts to /api/mcp and unwraps the tool result', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await claimHandle(
      'radiohead',
      { draft_id: DRAFT_ID, draft_token: 't' },
      {
        baseUrl: 'https://jov.ie',
        fetchImpl: async (input, init) => {
          calls.push({ url: String(input), init: init ?? {} });
          return mcpFetch({
            status: 'reserved',
            handle: 'radiohead',
            claim_url: 'https://jov.ie/claim/agent/x?h=y',
          })(input, init);
        },
      }
    );
    expect(result).toMatchObject({ status: 'reserved', handle: 'radiohead' });
    expect(calls[0]?.url).toBe('https://jov.ie/api/mcp');
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      method: string;
      params: { name: string; arguments: Record<string, unknown> };
    };
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('claim_handle');
    expect(body.params.arguments).toMatchObject({
      draft_id: DRAFT_ID,
      handle: 'radiohead',
    });
  });

  it('raises a coded JovieRequestError when the tool reports an error', async () => {
    const promise = getQualification(
      { draft_id: DRAFT_ID, draft_token: 't' },
      {
        fetchImpl: mcpFetch(
          { status: 'error', code: 'DRAFT_UNAVAILABLE', retryable: false },
          true
        ),
      }
    );
    await expect(promise).rejects.toMatchObject({
      apiCode: 'DRAFT_UNAVAILABLE',
    });
    await expect(promise).rejects.toBeInstanceOf(JovieRequestError);
  });

  it('raises INVALID_RESPONSE on a malformed MCP reply', async () => {
    const promise = shareProfile('radiohead', {
      fetchImpl: async () =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 'other' }), {
          status: 200,
        }),
    });
    await expect(promise).rejects.toMatchObject({
      apiCode: 'INVALID_RESPONSE',
    });
  });

  it('passes the mom-test answer through answer_onboarding_question', async () => {
    let captured: Record<string, unknown> | undefined;
    const result = await answerOnboardingQuestion(
      'promoSpend',
      'under_50',
      { draft_id: DRAFT_ID, draft_token: 't' },
      {
        fetchImpl: async (input, init) => {
          const body = JSON.parse(String(init?.body)) as {
            params: { arguments: Record<string, unknown> };
          };
          captured = body.params.arguments;
          return mcpFetch({
            status: 'recorded',
            recorded: 'promoSpend',
            remaining_questions: [],
          })(input, init);
        },
      }
    );
    expect(result).toMatchObject({
      status: 'recorded',
      recorded: 'promoSpend',
    });
    expect(captured).toMatchObject({
      question: 'promoSpend',
      answer: 'under_50',
      draft_id: DRAFT_ID,
    });
  });

  it('build_profile and publish_profile pass the capability through', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params: { name: string; arguments: Record<string, unknown> };
      };
      calls.push({ name: body.params.name, args: body.params.arguments });
      if (body.params.name === 'build_profile')
        return mcpFetch({ status: 'draft_ready', catalog: null })(input, init);
      return mcpFetch({
        status: 'claim_required',
        claim_url: 'https://jov.ie/claim/agent/x?h=y',
      })(input, init);
    };
    const ref = { draft_id: DRAFT_ID, draft_token: 't' };
    const built = (await buildProfile(ref, { fetchImpl })) as Record<
      string,
      unknown
    >;
    expect(built).toMatchObject({ status: 'draft_ready' });
    const published = (await publishProfile(ref, { fetchImpl })) as Record<
      string,
      unknown
    >;
    expect(published).toMatchObject({ status: 'claim_required' });
    expect(calls.map(call => call.name)).toEqual([
      'build_profile',
      'publish_profile',
    ]);
    for (const call of calls)
      expect(call.args).toMatchObject({
        draft_id: DRAFT_ID,
        draft_token: 't',
      });
  });

  it('returns the checkout entry from start_upgrade untouched', async () => {
    const result = await startUpgrade(
      { draft_id: DRAFT_ID, draft_token: 't' },
      {
        fetchImpl: mcpFetch({
          status: 'ok',
          checkout_url: 'https://jov.ie/claim/start?new=1',
        }),
      }
    );
    expect(result).toMatchObject({
      status: 'ok',
      checkout_url: 'https://jov.ie/claim/start?new=1',
    });
  });
});
