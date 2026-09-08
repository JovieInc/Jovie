import { verifyVercelOidc } from 'eve/channels/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import channel, {
  JOVIE_PRODUCTION_OIDC_SUBJECT,
} from '../agent/channels/summer-shadow';
import {
  conversationPath,
  renderConversation,
} from '../agent/lib/summer-web-conversation';

const { records } = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
}));
vi.mock('../agent/lib/vercel-blob-shadow-store', () => ({
  readImmutableShadowRecord: vi.fn(
    async (path: string) => records.get(path) ?? null
  ),
  persistImmutableShadowRecord: vi.fn(
    async (path: string, record: Record<string, unknown>) => {
      if (records.has(path)) return 'exists';
      records.set(path, record);
      return 'created';
    }
  ),
}));
vi.mock('eve/channels/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('eve/channels/auth')>()),
  verifyVercelOidc: vi.fn(),
}));
const value = {
  eventId: `sum_${'1'.repeat(24)}`,
  conversationId: 'summer-session-current' as const,
  previousEventId: null,
  principalHash: 'a'.repeat(43),
  deploymentId: 'dpl_test',
  message: 'Hello Summer',
  history: [],
};
const post = channel.routes[0];
const get = channel.routes[1];
function fixture() {
  const send = vi.fn(async () => ({ id: 'ses_summer' }));
  const getEventStream = vi.fn(
    async () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'message.received',
            data: { message: renderConversation(value), turnId: 'turn_one' },
          });
          controller.enqueue({
            type: 'message.completed',
            data: {
              message: 'Hello Tim',
              finishReason: 'stop',
              turnId: 'turn_one',
            },
          });
          controller.enqueue({
            type: 'turn.completed',
            data: { turnId: 'turn_one' },
          });
          controller.close();
        },
      })
  );
  const context = {
    params: { eventId: value.eventId },
    from: vi.fn(() => ({ send })),
    attachSession: vi.fn(() => ({ send, getEventStream })),
    resolveSession: vi.fn(async (): Promise<{ id: string } | null> => null),
  };
  const request = (method: string, headers = {}) =>
    new Request('https://eve.test/conversation', {
      method,
      headers: {
        authorization: 'Bearer opaque',
        'x-jovie-summer-principal-hash': value.principalHash,
        'x-jovie-summer-deployment-id': value.deploymentId,
        ...headers,
      },
      ...(method === 'POST' ? { body: JSON.stringify(value) } : {}),
    });
  return { send, getEventStream, context, request };
}

describe('native Summer conversation route integration', () => {
  beforeEach(() => {
    records.clear();
    vi.resetAllMocks();
    vi.stubEnv('SUMMER_SHADOW_ENABLED', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', value.deploymentId);
    vi.stubEnv(
      'SUMMER_CONVERSATION_FOUNDER_PRINCIPAL_HASH',
      value.principalHash
    );
    vi.mocked(verifyVercelOidc).mockResolvedValue({
      ok: true,
      sessionAuth: { subject: JOVIE_PRODUCTION_OIDC_SUBJECT, attributes: {} },
    } as Awaited<ReturnType<typeof verifyVercelOidc>>);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('dispatches with conversation-only auth and returns the deployment-bound native event result without signatures', async () => {
    const f = fixture();
    expect(
      (await post.handler(f.request('POST'), f.context as never)).status
    ).toBe(202);
    expect(f.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          attributes: expect.objectContaining({ summerConversation: 'true' }),
        }),
      })
    );
    const response = await get.handler(f.request('GET'), f.context as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        eventId: value.eventId,
        principalHash: value.principalHash,
        deploymentId: value.deploymentId,
        responseText: 'Hello Tim',
      },
    });
    expect(response.headers.get('x-jovie-eve-deployment-id')).toBe(
      value.deploymentId
    );
    expect(f.send).toHaveBeenCalledOnce();
  });
  it.each([
    'x-jovie-summer-principal-hash',
    'x-jovie-summer-deployment-id',
  ])('rejects wrong %s before accessing a private session', async header => {
    const f = fixture();
    expect(
      (
        await get.handler(
          f.request('GET', { [header]: 'wrong' }),
          f.context as never
        )
      ).status
    ).toBe(403);
    expect(f.getEventStream).not.toHaveBeenCalled();
    expect(f.context.resolveSession).not.toHaveBeenCalled();
  });
  it('rejects wrong OIDC app before admission or result retrieval', async () => {
    const f = fixture();
    vi.mocked(verifyVercelOidc).mockResolvedValue({
      ok: true,
      sessionAuth: {
        subject: 'owner:jovie:project:other:environment:production',
        attributes: {},
      },
    } as Awaited<ReturnType<typeof verifyVercelOidc>>);
    expect(
      (await post.handler(f.request('POST'), f.context as never)).status
    ).toBe(401);
    expect(
      (await get.handler(f.request('GET'), f.context as never)).status
    ).toBe(401);
    expect(records.size).toBe(0);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.getEventStream).not.toHaveBeenCalled();
  });
  it('reconciles a reserved uncertain send through the stream without another dispatch', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error('lost send acknowledgement'));
    expect(
      (await post.handler(f.request('POST'), f.context as never)).status
    ).toBe(503);
    expect(records.has(conversationPath('admissions', value.eventId))).toBe(
      true
    );
    expect(
      (await post.handler(f.request('POST'), f.context as never)).status
    ).toBe(503);
    f.context.resolveSession.mockResolvedValue({ id: 'ses_summer' });
    expect(
      (await get.handler(f.request('GET'), f.context as never)).status
    ).toBe(200);
    expect(f.send).toHaveBeenCalledOnce();
  });
});
