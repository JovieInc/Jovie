import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  execute: vi.fn(),
  submit: vi.fn(),
  pause: vi.fn(),
  captureError: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { execute: hoisted.execute } }));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: hoisted.submit,
}));
vi.mock('@/lib/email/gateway/pause.server', () => ({
  pauseStream: hoisted.pause,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: hoisted.warn, info: vi.fn(), error: vi.fn() },
}));

const { evaluateStream, evaluateStreamFromEvent, loadDeliverability } =
  await import('@/lib/email/deliverability/loop.server');

function outcomes(
  stream: string,
  delivered: number,
  bounced: number,
  complained: number
) {
  return {
    rows: [
      {
        stream,
        senderDomain: 'send.jov.ie',
        status: 'delivered',
        count: delivered,
      },
      {
        stream,
        senderDomain: 'send.jov.ie',
        status: 'bounced',
        count: bounced,
      },
      {
        stream,
        senderDomain: 'send.jov.ie',
        status: 'complained',
        count: complained,
      },
    ],
  };
}

const now = new Date('2026-10-29T12:34:00Z');

describe('email deliverability loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.submit.mockResolvedValue({
      outcome: 'created',
      card: { id: 'sc_x' },
    });
    hoisted.pause.mockResolvedValue(true);
  });

  it('does nothing below the sample floor or when clean', async () => {
    hoisted.execute.mockResolvedValueOnce(outcomes('broadcast', 10, 5, 2));
    expect(await evaluateStream('broadcast', now)).toBe('insufficient-data');
    hoisted.execute.mockResolvedValueOnce(outcomes('broadcast', 1000, 1, 0));
    expect(await evaluateStream('broadcast', now)).toBe('ok');
    expect(hoisted.submit).not.toHaveBeenCalled();
    expect(hoisted.pause).not.toHaveBeenCalled();
  });

  it('pauses a broadcast over the Gmail line and files a resume card that never defaults', async () => {
    hoisted.execute.mockResolvedValueOnce(outcomes('broadcast', 1000, 0, 2));
    expect(await evaluateStream('broadcast', now)).toBe('paused');
    const card = hoisted.submit.mock.calls[0]?.[0];
    expect(card).toMatchObject({
      kind: 'decision',
      product: 'jov',
      idempotencyKey: 'email-pause-broadcast-2026102912',
      defaultDecision: 'none',
    });
    expect(card.body).toContain('complaints 0.200%');
    expect(hoisted.pause).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: 'broadcast',
        resumeCardId: expect.stringMatching(/^sc_[0-9a-f]{32}$/),
      })
    );
  });

  it('reports an existing pause and logs a card conflict', async () => {
    hoisted.execute.mockResolvedValueOnce(outcomes('lifecycle', 950, 50, 0));
    hoisted.submit.mockResolvedValueOnce({ outcome: 'conflict' });
    hoisted.pause.mockResolvedValueOnce(false);
    expect(await evaluateStream('lifecycle', now)).toBe('already-paused');
    expect(hoisted.warn).toHaveBeenCalledWith(
      'email_deliverability_card_conflict',
      expect.anything()
    );
  });

  it('never pauses transactional; it files an incident instead', async () => {
    hoisted.execute.mockResolvedValueOnce(
      outcomes('transactional', 1000, 0, 4)
    );
    expect(await evaluateStream('transactional', now)).toBe('incident-filed');
    expect(hoisted.pause).not.toHaveBeenCalled();
    expect(hoisted.submit.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: 'email-incident-transactional-20261029',
    });
  });

  it('files an incident over the warn line without pausing', async () => {
    hoisted.execute.mockResolvedValueOnce(outcomes('founder', 1000, 0, 1));
    expect(await evaluateStream('founder', now)).toBe('incident-filed');
    expect(hoisted.pause).not.toHaveBeenCalled();
  });

  it('judges untagged events as transactional and never throws into the webhook', async () => {
    hoisted.execute.mockResolvedValueOnce(outcomes('transactional', 10, 0, 0));
    await evaluateStreamFromEvent(undefined);
    hoisted.execute.mockRejectedValueOnce(new Error('db down'));
    await expect(evaluateStreamFromEvent('broadcast')).resolves.toBeUndefined();
    expect(hoisted.captureError).toHaveBeenCalledWith(
      '[email-deliverability] evaluation failed',
      expect.any(Error),
      { stream: 'broadcast' }
    );
  });

  it('loads the summary with Forge eligibility', async () => {
    hoisted.execute.mockResolvedValueOnce(outcomes('transactional', 600, 1, 0));
    const summary = await loadDeliverability(now, true);
    expect(summary.forge.ready).toBe(true);
    expect(summary.streams[0]?.stream).toBe('transactional');
  });
});
