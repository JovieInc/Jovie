import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentHandoffDiscovery } from '@/lib/acquisition/agent-handoff';
import { AGENT_INTENT_QUERY } from '@/lib/acquisition/agent-intent';
import { openFirstTouchEnvelope } from '@/lib/acquisition/first-touch-envelope';
import { supportedAgentDecision } from '@/tests/fixtures/agent-handoff';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockAtomic = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/db', () => ({ db: { execute: mockExecute } }));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: (fn: (tx: unknown) => unknown, options: unknown) => {
    mockAtomic(options);
    return fn({ execute: mockExecute });
  },
}));

import { POST } from './route';

function request(acquisitionId = '7f5bb735-8e88-4d78-ae32-5228cc12a8bb') {
  return new NextRequest('http://localhost/api/acquisition', {
    method: 'POST',
    body: JSON.stringify({
      acquisitionId,
      capturedAt: '2026-09-20T00:00:00.000Z',
      firstTouch: { source: 'organic', campaign: 'release' },
    }),
  });
}

describe('POST /api/acquisition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockExecute.mockResolvedValue({ rows: [{ id: 'journey' }] });
  });

  it('stays database-free during secretless visual capture', async () => {
    vi.stubEnv('E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH', '1');

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: false, linked: false });
    expect(mockGetCachedAuth).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('records and links only the exact acquisition id for an authenticated user', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: '0f8b2c1e-5d3a-4f6b-9a7c-1e2d3c4b5a69',
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recorded: true,
      linked: true,
    });
    // upsert, link, then pixel events: separate statements (a single
    // data-modifying CTE statement never linked a journey; see
    // tests/unit/lib/acquisition/journey-link.test.ts).
    expect(mockExecute).toHaveBeenCalledTimes(3);
    const sqlText = JSON.stringify(mockExecute.mock.calls.map(c => c[0]));
    expect(sqlText).toContain('pe.acquisition_id = journey.id');
    expect(sqlText).toContain('pe.user_id IS NULL');
    // Defect guard: getCachedAuth().userId is users.id, so the lookup must key
    // on users.id. Keying on better_auth_user_id never matched, and the
    // funnel's sign-in stage read 0 for every journey.
    expect(sqlText).toContain('WHERE id = ');
    expect(sqlText).not.toContain('better_auth_user_id =');
    expect(sqlText).toContain('0f8b2c1e-5d3a-4f6b-9a7c-1e2d3c4b5a69');
  });

  it('uses a constant actor id, never the request-supplied journey id', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    await POST(request());
    expect(mockAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'system:acquisition-capture' })
    );
    mockAtomic.mockClear();
    mockGetCachedAuth.mockResolvedValue({
      userId: '0f8b2c1e-5d3a-4f6b-9a7c-1e2d3c4b5a69',
    });
    await POST(request());
    expect(mockAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'system:acquisition-capture' })
    );
  });

  it('reports linked false when the link guard refused the journey', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: '0f8b2c1e-5d3a-4f6b-9a7c-1e2d3c4b5a69',
    });
    mockExecute.mockResolvedValue({ rows: [] });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      recorded: true,
      linked: false,
    });
  });

  it('does not claim a link for a non-uuid auth id', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'ba-user-1' });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ linked: false });
    expect(JSON.stringify(mockExecute.mock.calls[0][0])).not.toContain(
      'ba-user-1'
    );
  });

  it('rejects malformed ids without writing', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    expect((await POST(request('not-an-id'))).status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

const browserId = '7f5bb735-8e88-4d78-ae32-5228cc12a8bb';
async function signedRequest(body: Record<string, unknown>) {
  const discovery = await buildAgentHandoffDiscovery(supportedAgentDecision());
  const token = new URL(discovery.handoffUrl as string).searchParams.get(
    AGENT_INTENT_QUERY
  ) as string;
  const envelope = await openFirstTouchEnvelope(token);
  return {
    envelope,
    request: new NextRequest('https://jov.ie/api/acquisition', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `jovie_first_touch=${token}`,
      },
      body: JSON.stringify(body),
    }),
  };
}

describe('signed acquisition capture', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockGetCachedAuth.mockResolvedValue({
      userId: '0f8b2c1e-5d3a-4f6b-9a7c-1e2d3c4b5a69',
    });
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [{ id: 'journey' }] });
    vi.stubEnv('ACQUISITION_FIRST_TOUCH_SECRET', 'capture-test-signing-key');
  });
  it('persists signed source and identity instead of unsigned browser values', async () => {
    const { envelope, request: req } = await signedRequest({
      acquisitionId: browserId,
      capturedAt: new Date().toISOString(),
      firstTouch: { source: 'forged' },
    });
    expect(await (await POST(req)).json()).toMatchObject({
      acquisitionId: envelope?.id,
      recorded: true,
      linked: true,
    });
    const persisted = JSON.stringify(mockExecute.mock.calls[0][0]);
    expect(persisted).toContain(envelope?.id);
    expect(persisted).toContain('agent-handoff');
    expect(persisted).not.toContain('forged');
    expect(persisted).not.toContain(browserId);
  });
  it('rejects attempts to submit agent evidence through unsigned request bodies', async () => {
    const { request: req } = await signedRequest({
      acquisitionId: browserId,
      capturedAt: new Date().toISOString(),
      firstTouch: { agentIntent: { rail: 'ordinary-web-checkout' } },
    });
    expect((await POST(req)).status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
  it('revokes the same signed identity even before client storage has synchronized', async () => {
    const { envelope, request: req } = await signedRequest({
      action: 'revoke',
      acquisitionId: browserId,
    });
    expect((await POST(req)).status).toBe(200);
    const persisted = JSON.stringify(mockExecute.mock.calls[0][0]);
    expect(persisted).toContain(envelope?.id);
    expect(persisted).not.toContain(browserId);
  });
});
