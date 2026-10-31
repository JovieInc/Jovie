import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  row: null as null | { id: string; context: Record<string, unknown> },
  stages: [] as string[],
  send: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (state.row ? [state.row] : []) }),
      }),
    }),
  },
}));
vi.mock('@/lib/email/gateway', () => ({ sendStreamEmail: state.send }));
vi.mock('./capture.server', () => ({
  recordCustomerVoiceStage: vi.fn(async (_id: string, stage: string) => {
    state.stages.push(stage);
  }),
}));

const { sendApprovedCustomerReply } = await import('./reply.server');

const ID = '11111111-2222-4333-8444-555555555555';
const TEXT = 'Hi,\n\nFair point. Want a quick call?\n\nTim';
const input = (text = TEXT) => ({
  text,
  draftSha256: createHash('sha256').update(TEXT).digest('hex'),
  approvedAt: '2026-10-31T16:01:00.000Z',
  approvalKey: 'photon-admission-key',
});
const voice = (over: Record<string, unknown> = {}) => ({
  customerVoice: {
    channel: 'email',
    replyTo: 'canary+customer-voice@jov.ie',
    replySubject: 'Question',
    inReplyTo: '<m1@mail>',
    urgent: false,
    urgentReasons: [],
    test: true,
    stages: { received: '2026-10-31T16:00:00.000Z' },
    ...over,
  },
});

describe('sendApprovedCustomerReply', () => {
  beforeEach(() => {
    state.row = { id: ID, context: voice() };
    state.stages = [];
    state.send.mockReset().mockResolvedValue({ status: 'sent' });
  });

  it('sends the approved text to the original sender only, threaded, once', async () => {
    const result = await sendApprovedCustomerReply(ID, input());
    expect(result.status).toBe('sent');
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send.mock.calls[0]![0]).toMatchObject({
      stream: 'founder',
      purpose: 'customer-voice-reply',
      to: 'canary+customer-voice@jov.ie',
      subject: 'Re: Question',
      text: TEXT,
      consent: { basis: 'existing-relationship' },
      idempotencyKey: `customer-voice-reply:${ID}`,
      headers: { 'In-Reply-To': '<m1@mail>' },
    });
    expect(state.stages).toEqual(['approved', 'sent']);
  });

  it('refuses text that differs from the approved draft', async () => {
    const result = await sendApprovedCustomerReply(ID, input(`${TEXT} PS`));
    expect(result).toMatchObject({ status: 'refused', code: 'draft_mismatch' });
    expect(state.send).not.toHaveBeenCalled();
  });

  it('refuses a second send, a missing address, and non customer-voice rows', async () => {
    state.row = {
      id: ID,
      context: voice({ stages: { sent: '2026-10-31T16:02:00.000Z' } }),
    };
    expect(await sendApprovedCustomerReply(ID, input())).toMatchObject({
      code: 'already_sent',
      httpStatus: 409,
    });
    state.row = { id: ID, context: voice({ replyTo: null }) };
    expect(await sendApprovedCustomerReply(ID, input())).toMatchObject({
      code: 'no_reply_address',
    });
    state.row = { id: ID, context: {} };
    expect(await sendApprovedCustomerReply(ID, input())).toMatchObject({
      code: 'not_customer_voice',
    });
    state.row = null;
    expect(await sendApprovedCustomerReply(ID, input())).toMatchObject({
      code: 'not_found',
      httpStatus: 404,
    });
    expect(state.send).not.toHaveBeenCalled();
  });

  it('does not record sent when the gateway skips or fails', async () => {
    state.send.mockResolvedValue({ status: 'skipped', code: 'stream-paused' });
    expect(await sendApprovedCustomerReply(ID, input())).toMatchObject({
      code: 'send_failed',
    });
    expect(state.stages).toEqual(['approved']);
  });
});
