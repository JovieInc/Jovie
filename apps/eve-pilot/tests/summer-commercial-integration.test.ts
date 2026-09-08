import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SessionAuthContext } from 'eve/context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSummerCommercialReadback } from '../agent/lib/summer-commercial-readback';
import {
  createSummerShadowIngressHandler,
  type ShadowRecord,
  summerShadowKey,
} from '../agent/lib/summer-shadow-ingress';
import { m, NOW, snapshot } from './commercial-fixture';

const auth: SessionAuthContext = {
  authenticator: 'vercel-oidc:ovie-summer-shadow',
  principalType: 'service',
  principalId: 'jovie-production',
  subject: 'owner:jovie:project:jovie:environment:production',
};
const authenticate = async () => auth;
const request = () =>
  new Request(
    'https://eve.example/ovie/v1/summer-shadow/commercial/event-0001'
  );
function event(turn = 1, commercialSnapshot = snapshot()) {
  return new Request('https://eve.example/ovie/v1/summer-shadow/events', {
    method: 'POST',
    body: JSON.stringify({
      schema: 'jovie.ovie-summer-shadow.event/v1',
      eventId: `event-000${turn}`,
      conversationId: 'conversation-0001',
      turn,
      dailySlot: turn,
      occurredAt: NOW.toISOString(),
      message: 'Evaluate portfolio evidence.',
      commercialSnapshot,
    }),
  });
}
describe('persisted Summer commercial observation', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'summer-commercial-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const read = async (path: string): Promise<ShadowRecord | null> => {
    try {
      return JSON.parse(await readFile(join(root, path), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  const persistImmutable = async (path: string, record: ShadowRecord) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    try {
      await writeFile(join(root, path), JSON.stringify(record), { flag: 'wx' });
      return 'created' as const;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        return 'exists' as const;
      throw error;
    }
  };
  const dispatch = vi.fn(async (_input: { message: string }) => ({
    sessionId: 'ses_commercial',
  }));
  const handler = () =>
    createSummerShadowIngressHandler({
      authenticate,
      persistImmutable,
      dispatch,
      enabled: () => true,
      now: () => NOW,
    });
  const readback = () =>
    createSummerCommercialReadback({ authenticate, read, now: () => NOW });

  it.each([
    'sessionId',
    'receiptPath',
    'authority',
    'schema',
  ])('does not attest malformed terminal %s', async field => {
    await handler()(event());
    const path = `summer-shadow/terminal/${summerShadowKey('event-0001')}.json`;
    const terminal = await read(path);
    await writeFile(
      join(root, path),
      JSON.stringify({ ...terminal, [field]: 'wrong' })
    );
    const body = await (await readback()(request(), 'event-0001')).json();
    expect(body.consumption).toBe('UNKNOWN');
  });

  it('persists before session dispatch, survives fresh handlers, and reevaluates changed evidence', async () => {
    dispatch.mockImplementationOnce(async input => {
      const stored = await read(
        `summer-shadow/receipts/${summerShadowKey('event-0001')}.json`
      );
      expect(stored?.commercialProjection).toMatchObject({
        selectedCandidateId: 'thumbnails',
      });
      expect(input.message).toContain('"selectedCandidateId":"thumbnails"');
      expect(input.message).toContain('not independently verified facts');
      expect(input.message).toContain('Never dispatch work');
      return { sessionId: 'ses_commercial' };
    });
    expect((await handler()(event())).status).toBe(202);
    const restartedReadback = readback();
    const persisted = await (
      await restartedReadback(request(), 'event-0001')
    ).json();
    expect(persisted.consumption).toBe(
      'eve_session_accepted; model_decision_unverified'
    );
    expect(persisted.currentProjection.selectedCandidateId).toBe('thumbnails');
    expect((await handler()(event())).status).toBe(409);
    const input = snapshot();
    input.candidates.push({
      ...input.candidates[0],
      id: 'lyb',
      product: 'logyourbody',
      lybCanaryPassed: true,
      paidValueCompletions: m(3),
    });
    const next = await (await handler()(event(2, input))).json();
    expect(next.commercialProjection.selectedCandidateId).toBe('lyb');
    expect(next.commercialProjection.evidenceDigest).not.toBe(
      persisted.currentProjection.evidenceDigest
    );
    input.candidates.forEach(item => {
      item.held = true;
    });
    const held = await (await handler()(event(3, input))).json();
    expect(held.commercialProjection.verdict).toBe('hold');
    expect(held.commercialProjection.authority.dispatchAuthority).toBe('none');
    const staleReadback = createSummerCommercialReadback({
      authenticate,
      read,
      now: () => new Date('2026-09-06T18:00:00Z'),
    });
    const stale = await (await staleReadback(request(), 'event-0001')).json();
    expect(stale.currentProjection.verdict).toBe('hold');
    expect(stale.receipt.commercialProjection.selectedCandidateId).toBe(
      'thumbnails'
    );
  });
  it('does not claim a consumed decision after failed dispatch or tampered projection', async () => {
    dispatch.mockRejectedValueOnce(new Error('transport down'));
    expect((await handler()(event())).status).toBe(503);
    const result = await (await readback()(request(), 'event-0001')).json();
    expect(result.consumption).toBe('UNKNOWN');
    const path = `summer-shadow/receipts/${summerShadowKey('event-0001')}.json`;
    const record = await read(path);
    await writeFile(
      join(root, path),
      JSON.stringify({ ...record, commercialProjection: {} })
    );
    expect((await readback()(request(), 'event-0001')).status).toBe(503);
  });
  it('authenticates readback before reading and handles missing/invalid/corrupt records', async () => {
    const deniedRead = vi.fn();
    const denied = createSummerCommercialReadback({
      authenticate: async () => new Response(null, { status: 401 }),
      read: deniedRead,
    });
    expect((await denied(request(), 'event-0001')).status).toBe(401);
    expect(deniedRead).not.toHaveBeenCalled();
    expect((await readback()(request(), '../secrets')).status).toBe(400);
    expect((await readback()(request(), 'event-0001')).status).toBe(404);
    const corrupt = createSummerCommercialReadback({
      authenticate,
      read: async () => ({ event: {} }),
    });
    expect((await corrupt(request(), 'event-0001')).status).toBe(503);
    const ordinary = createSummerCommercialReadback({
      authenticate,
      read: async () => ({
        event: {
          schema: 'jovie.ovie-summer-shadow.event/v1',
          eventId: 'event-0001',
          conversationId: 'conversation-0001',
          turn: 1,
          dailySlot: 1,
          occurredAt: NOW.toISOString(),
          message: 'hello',
        },
      }),
    });
    expect((await ordinary(request(), 'event-0001')).status).toBe(404);
  });
});
