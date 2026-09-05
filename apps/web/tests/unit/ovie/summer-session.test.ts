import { describe, expect, it } from 'vitest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import {
  appendSummerTurn,
  assertSummerIdentity,
  CURRENT_SUMMER_IDENTITY,
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
  openCurrentSummerSession,
  SummerSessionError,
} from '@/lib/ovie/summer-session';

describe('current Summer session (JOV-5212)', () => {
  it('reopens the same current session instead of forking a persona', async () => {
    const store = new MemoryOperatingStore();
    const first = await openCurrentSummerSession(store);
    expect(first.identity.sessionId).toBe(CURRENT_SUMMER_SESSION_ID);
    await appendSummerTurn(store, {
      clientTurnId: 'a',
      userText: 'hello',
      assistantText: 'Summer here',
      eveWorkId: 'ini_1',
      eveAcks: ['stored and queued for Summer lander'],
      correlationId: 'ini_1:a',
      state: 'completed',
      toolReceipt: null,
      createdAt: new Date().toISOString(),
    });
    const second = await openCurrentSummerSession(store);
    expect(second.turns).toHaveLength(1);
    expect(second.identity).toEqual(CURRENT_SUMMER_IDENTITY);
    expect((await loadCurrentSummerSession(store))?.turns[0]?.eveWorkId).toBe(
      'ini_1'
    );
  });

  it('rejects identity drift away from the current Eve Summer', () => {
    expect(() =>
      assertSummerIdentity({
        ...CURRENT_SUMMER_IDENTITY,
        speaker: 'ovie' as unknown as 'summer',
      })
    ).toThrow(SummerSessionError);
  });

  it('replaces a legacy canceled row instead of keeping an empty duplicate', async () => {
    const store = new MemoryOperatingStore();
    await appendSummerTurn(store, {
      clientTurnId: 'legacy-cancel',
      userText: 'Resume me',
      assistantText: '',
      eveWorkId: 'ini_1',
      eveAcks: ['stored'],
      correlationId: 'ini_1:legacy-cancel',
      state: 'canceled',
      toolReceipt: null,
      createdAt: new Date().toISOString(),
    });
    const recovered = await appendSummerTurn(store, {
      clientTurnId: 'legacy-cancel',
      userText: 'Resume me',
      assistantText: 'Recovered Summer after reconnect.',
      eveWorkId: 'ini_1',
      eveAcks: ['stored'],
      correlationId: 'ini_1:legacy-cancel',
      state: 'completed',
      toolReceipt: {
        tool: 'get_org_state',
        ok: true,
        receiptId: 'tool_resume',
        summary: 'org',
      },
      createdAt: new Date().toISOString(),
    });
    expect(recovered.turns).toHaveLength(1);
    expect(recovered.turns[0]).toMatchObject({
      turnIndex: 1,
      assistantText: 'Recovered Summer after reconnect.',
      state: 'completed',
      toolReceipt: { receiptId: 'tool_resume' },
    });
  });
});
