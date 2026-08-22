import { describe, expect, it } from 'vitest';
import {
  evaluateOvieConversationAcceptance,
  OVIE_CONVERSATION_ACCEPTANCE_CHECKS,
} from '@/lib/ovie/acceptance';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';

const passing: Parameters<typeof evaluateOvieConversationAcceptance>[0] = {
  eveWorkId: 'ini_work_1',
  summerSessionId: CURRENT_SUMMER_SESSION_ID,
  memoryNamespace: 'summer',
  speaker: 'summer',
  turnCount: 5,
  turnTexts: ['one', 'two', 'three', 'four', 'five'],
  toolReceipt: {
    ok: true,
    tool: 'get_org_state',
    receiptId: 'tool_ok_1',
  },
  relaunchSessionId: CURRENT_SUMMER_SESSION_ID,
  relaunchTurnCount: 5,
  canceledPersisted: false,
  reconnectRecoveredText: 'Recovered Summer after reconnect.',
  unavailableText: 'Conversation with the current Summer is unavailable.',
  operatorVisibleToCustomer: false,
  customerCanUseSummerTools: false,
  fallbackUsed: null,
};

describe('Ovie conversation acceptance contract (JOV-5212)', () => {
  it('passes a complete redacted five-turn Summer proof', () => {
    expect(evaluateOvieConversationAcceptance(passing)).toEqual({
      ok: true,
      failed: [],
    });
    expect(OVIE_CONVERSATION_ACCEPTANCE_CHECKS).toHaveLength(10);
  });

  it('fails closed on fork, fallback, leakage, or missing Eve binding', () => {
    expect(
      evaluateOvieConversationAcceptance({
        ...passing,
        eveWorkId: null,
        summerSessionId: 'forked-session',
        memoryNamespace: 'jovie-artist',
        speaker: 'jovie',
        turnCount: 2,
        turnTexts: ['one', 'two'],
        toolReceipt: {
          ok: true,
          tool: 'proposeAvatarUpload',
          receiptId: 'tool_bad',
        },
        fallbackUsed: 'mock',
        relaunchSessionId: 'forked-session-2',
        relaunchTurnCount: 0,
        canceledPersisted: true,
        reconnectRecoveredText: null,
        unavailableText: 'Falling back to Jovie.',
        operatorVisibleToCustomer: true,
        customerCanUseSummerTools: true,
      }).failed
    ).toEqual([...OVIE_CONVERSATION_ACCEPTANCE_CHECKS]);
  });
});
