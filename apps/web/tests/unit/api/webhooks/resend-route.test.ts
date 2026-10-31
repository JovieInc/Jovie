import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHeaders = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockStopEnrollmentsForEmail = vi.hoisted(() => vi.fn());
const mockGetCreatorByMessageId = vi.hoisted(() => vi.fn());
const mockRecordBounce = vi.hoisted(() => vi.fn());
const mockRecordComplaint = vi.hoisted(() => vi.fn());
const mockRecordDelivery = vi.hoisted(() => vi.fn());
const mockAddSuppression = vi.hoisted(() => vi.fn());
const mockLogDelivery = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockResendSecret = vi.hoisted(
  () => `whsec_${Buffer.from('resend-secret').toString('base64')}`
);
const mockWebhookConfig = vi.hoisted(() => ({ RESEND_WEBHOOK_SECRET: '' }));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/env-server', () => ({
  env: mockWebhookConfig,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  webhookEvents: {
    eventId: 'event_id',
    processed: 'processed',
    processedAt: 'processed_at',
    provider: 'provider',
  },
}));

vi.mock('@/lib/email/campaigns/enrollment', () => ({
  stopEnrollmentsForEmail: mockStopEnrollmentsForEmail,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/notifications/reputation', () => ({
  getCreatorByMessageId: mockGetCreatorByMessageId,
  recordBounce: mockRecordBounce,
  recordComplaint: mockRecordComplaint,
  recordDelivery: mockRecordDelivery,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  addSuppression: mockAddSuppression,
  logDelivery: mockLogDelivery,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

function signPayload(
  body: string,
  timestamp: number,
  eventId = 'evt_resend_123'
): string {
  const secretBytes = Buffer.from(mockResendSecret.slice(6), 'base64');
  const signature = createHmac('sha256', secretBytes)
    .update(`${eventId}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${signature}`;
}

function createSignedHeaders(body: string, eventId = 'evt_resend_123') {
  const timestamp = Math.floor(Date.now() / 1000);
  return new Headers({
    'svix-id': eventId,
    'svix-timestamp': String(timestamp),
    'svix-signature': signPayload(body, timestamp, eventId),
  });
}

function createDbChain<T>(terminal: T) {
  return {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(terminal),
    set: vi.fn().mockReturnThis(),
  };
}

function mockDatabase({ processed = false }: { processed?: boolean } = {}) {
  const insertChain = createDbChain(undefined);
  const selectChain = createDbChain([{ processed }]);
  const updateChain = createDbChain(undefined);
  updateChain.where.mockResolvedValue(undefined);

  mockInsert.mockReturnValue(insertChain);
  mockSelect.mockReturnValue(selectChain);
  mockUpdate.mockReturnValue(updateChain);

  return { insertChain, selectChain, updateChain };
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'email.delivered',
    created_at: '2026-05-24T00:00:00.000Z',
    data: {
      email_id: 'email_123',
      from: 'artist@example.com',
      to: ['fan@example.com'],
      subject: 'Release update',
      created_at: '2026-05-24T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockWebhookConfig.RESEND_WEBHOOK_SECRET = mockResendSecret;
    mockDatabase();
    mockGetCreatorByMessageId.mockResolvedValue(null);
    mockRecordBounce.mockResolvedValue({
      statusChanged: false,
      metrics: { bounceRate: 0 },
    });
    mockRecordComplaint.mockResolvedValue({
      statusChanged: false,
      metrics: { complaintRate: 0 },
    });
    mockRecordDelivery.mockResolvedValue(undefined);
    mockAddSuppression.mockResolvedValue({
      success: true,
      alreadyExists: false,
    });
    mockLogDelivery.mockResolvedValue(undefined);
    mockStopEnrollmentsForEmail.mockResolvedValue(undefined);
  });

  describe('published Svix verification oracle', () => {
    // Fixed external oracle, not produced by signPayload or the verifier:
    // https://docs.svix.com/receiving/verifying-payloads/how-manual#example-signatures
    const oracle = {
      secret: 'whsec_plJ3nmyCDGBKInavdOK15jsl',
      body: '{"event_type":"ping","data":{"success":true}}',
      id: 'msg_loFOjxBNrRLzqYUf',
      timestamp: '1731705121',
      signature: 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
    };

    beforeEach(() => {
      mockWebhookConfig.RESEND_WEBHOOK_SECRET = oracle.secret;
      vi.spyOn(Date, 'now').mockReturnValue(Number(oracle.timestamp) * 1000);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function deliver({
      id = oracle.id,
      body = oracle.body,
      signature = oracle.signature,
    } = {}) {
      mockHeaders.mockResolvedValue(
        new Headers({
          'svix-id': id,
          'svix-timestamp': oracle.timestamp,
          'svix-signature': signature,
        })
      );
      const { POST } = await import('@/app/api/webhooks/resend/route');
      return POST(
        new Request('https://example.com/api/webhooks/resend', {
          method: 'POST',
          body,
        }) as never
      );
    }

    it('accepts the independently published ID, timestamp and raw-body signature', async () => {
      const response = await deliver();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockCaptureCriticalError).not.toHaveBeenCalled();
    });

    it('accepts a valid signature among rotated signatures', async () => {
      const response = await deliver({
        signature: `v1,aW52YWxpZA== ${oracle.signature}`,
      });
      expect(response.status).toBe(200);
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('keeps a verified duplicate free of delivery and suppression effects', async () => {
      mockDatabase({ processed: true });
      const response = await deliver();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        received: true,
        status: 'already_processed',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogDelivery).not.toHaveBeenCalled();
      expect(mockAddSuppression).not.toHaveBeenCalled();
      expect(mockStopEnrollmentsForEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['changed message ID', { id: 'msg_different' }],
      ['changed raw-body bytes', { body: `${oracle.body}\n` }],
      [
        'legacy signature omitting the message ID',
        // Python stdlib HMAC over timestamp.body with the public oracle key.
        { signature: 'v1,NBlQ6TW1KAk/5p6TCTppEu/l5TgB2n7nRs+hFLCLJRk=' },
      ],
      [
        'unsupported signature version',
        { signature: oracle.signature.replace('v1,', 'v2,') },
      ],
    ] as const)(
      'rejects %s before persistence or business effects',
      async (_name, changes) => {
        const response = await deliver(changes);
        expect(response.status).toBe(401);
        expect(mockInsert).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockLogDelivery).not.toHaveBeenCalled();
        expect(mockAddSuppression).not.toHaveBeenCalled();
        expect(mockStopEnrollmentsForEmail).not.toHaveBeenCalled();
      }
    );

    it.each([-301, 301])(
      'rejects a valid signature outside the clock tolerance (%s seconds)',
      async offset => {
        vi.mocked(Date.now).mockReturnValue(
          (Number(oracle.timestamp) + offset) * 1000
        );
        const response = await deliver();
        expect(response.status).toBe(401);
        expect(mockInsert).not.toHaveBeenCalled();
      }
    );
  });

  it('returns 400 when required SVix headers are missing', async () => {
    mockHeaders.mockResolvedValue(new Headers());

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body: JSON.stringify({ type: 'email.delivered', data: {} }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing webhook headers',
    });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Missing Resend webhook headers',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/resend',
      })
    );
  });

  it('rejects stale SVix timestamps before parsing or recording the event', async () => {
    const body = JSON.stringify(baseEvent());
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60;
    mockHeaders.mockResolvedValue(
      new Headers({
        'svix-id': 'evt_stale',
        'svix-timestamp': String(staleTimestamp),
        'svix-signature': signPayload(body, staleTimestamp, 'evt_stale'),
      })
    );

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body,
      }) as never
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Invalid Resend webhook signature',
      expect.any(Error),
      expect.objectContaining({ route: '/api/webhooks/resend' })
    );
  });

  it('records and processes delivered events once', async () => {
    mockGetCreatorByMessageId.mockResolvedValue('creator_123');
    const body = JSON.stringify(baseEvent());
    mockHeaders.mockResolvedValue(createSignedHeaders(body));

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockRecordDelivery).toHaveBeenCalledWith('creator_123');
    expect(mockLogDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        recipientEmail: 'fan@example.com',
        status: 'delivered',
        providerMessageId: 'email_123',
        metadata: { creatorProfileId: 'creator_123' },
      })
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns idempotent success without side effects for already processed events', async () => {
    mockDatabase({ processed: true });
    const body = JSON.stringify(baseEvent());
    mockHeaders.mockResolvedValue(createSignedHeaders(body, 'evt_processed'));

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      status: 'already_processed',
    });
    expect(mockLogDelivery).not.toHaveBeenCalled();
    expect(mockAddSuppression).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('suppresses soft bounces, stops enrollments, and attributes creator reputation', async () => {
    mockGetCreatorByMessageId.mockResolvedValue('creator_456');
    mockRecordBounce.mockResolvedValue({
      statusChanged: true,
      newStatus: 'warning',
      metrics: { bounceRate: 0.12 },
    });
    const body = JSON.stringify(
      baseEvent({
        type: 'email.bounced',
        data: {
          email_id: 'email_bounce',
          from: 'artist@example.com',
          to: ['fan@example.com', 'other@example.com'],
          subject: 'Release update',
          created_at: '2026-05-24T00:00:00.000Z',
          bounce: {
            message: 'Mailbox full, try again later',
            diagnostic_code: '452',
          },
        },
      })
    );
    mockHeaders.mockResolvedValue(createSignedHeaders(body, 'evt_bounce'));

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mockAddSuppression).toHaveBeenCalledTimes(2);
    expect(mockAddSuppression).toHaveBeenCalledWith(
      'fan@example.com',
      'soft_bounce',
      'webhook',
      expect.objectContaining({
        sourceEventId: 'evt_bounce',
        metadata: expect.objectContaining({
          bounceCode: '452',
          bounceMessage: 'Mailbox full, try again later',
        }),
        expiresAt: expect.any(Date),
      })
    );
    expect(mockRecordBounce).toHaveBeenCalledWith('creator_456');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[Resend Webhook] Creator reputation changed to warning',
      expect.objectContaining({
        creatorProfileId: 'creator_456',
        bounceRate: 0.12,
        eventId: 'evt_bounce',
      })
    );
    expect(mockLogDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'fan@example.com',
        status: 'bounced',
        metadata: expect.objectContaining({
          creatorProfileId: 'creator_456',
          eventType: 'email.bounced',
        }),
      })
    );
    expect(mockStopEnrollmentsForEmail).toHaveBeenCalledWith(
      'fan@example.com',
      'bounced',
      { throwOnError: true }
    );
  });

  it('logs open and click events as delivered engagement signals', async () => {
    const body = JSON.stringify(
      baseEvent({
        type: 'email.clicked',
        data: {
          email_id: 'email_click',
          from: 'artist@example.com',
          to: ['fan@example.com'],
          subject: 'Release update',
          created_at: '2026-05-24T00:00:00.000Z',
          click: {
            link: 'https://jov.ie/tim',
            user_agent: 'Mozilla/5.0',
          },
        },
      })
    );
    mockHeaders.mockResolvedValue(createSignedHeaders(body, 'evt_click'));

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mockLogDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        recipientEmail: 'fan@example.com',
        status: 'delivered',
        providerMessageId: 'email_click',
        metadata: expect.objectContaining({
          eventType: 'email.clicked',
          engagementType: 'click',
          clickLink: 'https://jov.ie/tim',
          clickUserAgent: 'Mozilla/5.0',
        }),
      })
    );
  });

  describe('fails loud when a bounce or complaint cannot be persisted', () => {
    function bounceBody(to = ['fan@example.com']) {
      return JSON.stringify(
        baseEvent({
          type: 'email.bounced',
          data: {
            email_id: 'email_bounce',
            from: 'artist@example.com',
            to,
            subject: 'Release update',
            created_at: '2026-05-24T00:00:00.000Z',
            bounce: { message: 'User unknown', diagnostic_code: '550' },
          },
        })
      );
    }

    async function post(body: string) {
      mockHeaders.mockResolvedValue(createSignedHeaders(body, 'evt_fail'));
      const { POST } = await import('@/app/api/webhooks/resend/route');
      return POST(
        new Request('https://example.com/api/webhooks/resend', {
          method: 'POST',
          body,
        }) as never
      );
    }

    function setCalls(
      updateChain: ReturnType<typeof mockDatabase>['updateChain']
    ) {
      return updateChain.set.mock.calls.map(
        call => call[0] as Record<string, unknown>
      );
    }

    it('never acknowledges a bounce whose suppression write failed', async () => {
      const { updateChain } = mockDatabase();
      mockGetCreatorByMessageId.mockResolvedValue('creator_456');
      mockAddSuppression.mockResolvedValue({
        success: false,
        error: 'connection terminated',
      });

      const response = await post(bounceBody());

      // Svix retries non-2xx deliveries; a 200 here would lose the bounce.
      expect(response.status).toBe(500);
      // Retried in-process before giving up.
      expect(mockAddSuppression).toHaveBeenCalledTimes(3);
      const writes = setCalls(updateChain);
      expect(writes.some(write => write.processed === true)).toBe(false);
      // Dead-lettered on the stored event row for replay and audit.
      expect(writes).toContainEqual(
        expect.objectContaining({
          error: expect.stringContaining('suppression'),
        })
      );
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Resend webhook processing failed',
        expect.anything(),
        expect.objectContaining({ eventId: 'evt_fail' })
      );
      // Non-idempotent side effects wait until suppression is durable.
      expect(mockRecordBounce).not.toHaveBeenCalled();
    });

    it('treats a thrown suppression write the same way', async () => {
      const { updateChain } = mockDatabase();
      mockAddSuppression.mockRejectedValue(new Error('db down'));

      const response = await post(bounceBody());

      expect(response.status).toBe(500);
      expect(
        setCalls(updateChain).some(write => write.processed === true)
      ).toBe(false);
    });

    it('retries a transient suppression failure, then acknowledges', async () => {
      const { updateChain } = mockDatabase();
      mockAddSuppression
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValue({ success: true, alreadyExists: false });

      const response = await post(bounceBody());

      expect(response.status).toBe(200);
      expect(mockAddSuppression).toHaveBeenCalledTimes(2);
      expect(setCalls(updateChain)).toContainEqual(
        expect.objectContaining({ processed: true })
      );
    });

    it('never acknowledges when campaign enrollments could not be stopped', async () => {
      const { updateChain } = mockDatabase();
      mockStopEnrollmentsForEmail.mockRejectedValue(new Error('db down'));

      const response = await post(bounceBody());

      expect(response.status).toBe(500);
      expect(mockStopEnrollmentsForEmail).toHaveBeenCalledWith(
        'fan@example.com',
        'bounced',
        { throwOnError: true }
      );
      expect(
        setCalls(updateChain).some(write => write.processed === true)
      ).toBe(false);
    });
  });
});
