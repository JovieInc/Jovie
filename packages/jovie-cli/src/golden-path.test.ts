import { describe, expect, it } from 'vitest';

import { JovieInputError, JovieRequestError } from './client.js';
import {
  answerOnboardingQuestion,
  claimHandle,
  draftRef,
  getQualification,
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
