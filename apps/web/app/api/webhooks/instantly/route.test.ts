import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leadFunnelEvents } from '@/lib/db/schema/leads';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  env: {
    INSTANTLY_CAMPAIGN_ID: '00000000-0000-4000-8000-000000000001' as
      | string
      | undefined,
    INSTANTLY_WEBHOOK_SECRET: 'test-only-instantly-webhook-secret' as
      | string
      | undefined,
  },
  captureError: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert },
}));

const campaignId = '00000000-0000-4000-8000-000000000001';
const leadId = '00000000-0000-4000-8000-000000000002';
const payload = {
  event_type: 'reply_received',
  campaign_id: campaignId,
  workspace: '00000000-0000-4000-8000-000000000003',
  timestamp: '2026-10-21T01:00:00.000Z',
  lead_email: 'Artist@Example.com',
  email_id: 'provider-reply-id',
  reply_text: 'Private reply content',
  reply_subject: 'Private subject',
};

function request(body: unknown = payload, authorization = true) {
  return new Request('https://jov.ie/api/webhooks/instantly', {
    method: 'POST',
    headers: authorization
      ? { Authorization: 'Bearer test-only-instantly-webhook-secret' }
      : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('Instantly reply capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.INSTANTLY_CAMPAIGN_ID = campaignId;
    mocks.env.INSTANTLY_WEBHOOK_SECRET = 'test-only-instantly-webhook-secret';
    mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([
      { id: leadId, instantlyLeadId: 'enrolled-id' },
    ]);
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
    });
    mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 'funnel-event-id' }]);
  });

  it.each(['INSTANTLY_CAMPAIGN_ID', 'INSTANTLY_WEBHOOK_SECRET'] as const)(
    'fails closed without %s',
    async key => {
      mocks.env[key] = undefined;
      expect((await POST(request())).status).toBe(503);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );

  it('fails closed with a short webhook secret', async () => {
    mocks.env.INSTANTLY_WEBHOOK_SECRET = 'short-secret';
    expect((await POST(request())).status).toBe(503);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    'Bearer wrong-secret',
    'Bearer test-only-instantly-webhook-secreX',
    'Basic invalid',
  ])(
    'rejects unauthorized requests before reading their body (%s)',
    async authorization => {
      const req = request('invalid-json', false);
      if (authorization) req.headers.set('authorization', authorization);
      expect((await POST(req)).status).toBe(401);
      expect(req.bodyUsed).toBe(false);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );

  it('rejects malformed JSON without logging reply content', async () => {
    const response = await POST(request('{"private": "unterminated'));
    expect(response.status).toBe(400);
    expect(JSON.stringify(mocks.captureError.mock.calls)).not.toContain(
      'unterminated'
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('bounds the request body', async () => {
    const response = await POST(request('x'.repeat(1024 * 1024 + 1)));
    expect(response.status).toBe(413);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([null, {}, { event_type: 5 }])(
    'rejects an invalid event envelope (%j)',
    async body => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );

  it.each(['auto_reply_received', 'email_opened', 'email_replied'])(
    'acknowledges %s without changing the reply funnel',
    async eventType => {
      const response = await POST(request({ event_type: eventType }));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        received: true,
        ignored: true,
      });
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );

  it.each([
    { lead_email: undefined },
    { lead_email: 'invalid' },
    { campaign_id: undefined },
    { timestamp: 'not-a-date' },
    { timestamp: undefined },
  ])('rejects incomplete reply evidence (%j)', async changes => {
    expect((await POST(request({ ...payload, ...changes }))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('ignores replies from another campaign', async () => {
    const response = await POST(request({ ...payload, campaign_id: leadId }));
    expect(response.status).toBe(200);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('ignores replies that have no enrolled lead', async () => {
    mocks.limit.mockResolvedValue([]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses ambiguous email matches rather than attributing to an arbitrary lead', async () => {
    mocks.limit.mockResolvedValue([
      { id: leadId, instantlyLeadId: 'first' },
      { id: 'other-lead', instantlyLeadId: 'second' },
    ]);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('records a reply milestone for a case-insensitive, enrolled email match', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      received: true,
      deduped: false,
    });
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain('lower(');
    expect(query.sql).toContain('"instantly_lead_id" is not null');
    expect(query.params).toEqual(['artist@example.com']);
    expect(mocks.limit).toHaveBeenCalledWith(2);
    expect(mocks.insert).toHaveBeenCalledWith(leadFunnelEvents);
    expect(mocks.values).toHaveBeenCalledWith({
      leadId,
      eventType: 'email_replied',
      channel: 'email',
      provider: 'instantly',
      campaignKey: 'claim_invite',
      variantKey: null,
      occurredAt: new Date(payload.timestamp),
      metadata: {
        campaignId,
        instantlyLeadId: 'enrolled-id',
        emailId: payload.email_id,
      },
    });
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [leadFunnelEvents.leadId, leadFunnelEvents.eventType],
    });
    expect(JSON.stringify(mocks.values.mock.calls)).not.toContain('Private');
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('accepts the documented payload when optional email_id is absent', async () => {
    expect(
      (await POST(request({ ...payload, email_id: undefined }))).status
    ).toBe(200);
    expect(mocks.values.mock.calls[0][0].metadata.emailId).toBeNull();
  });

  it('acknowledges a durable conflict without a second reply milestone', async () => {
    mocks.returning.mockResolvedValue([]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      deduped: true,
    });
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [leadFunnelEvents.leadId, leadFunnelEvents.eventType],
    });
  });

  it('returns a retryable failure on persistence error and can record the retry', async () => {
    mocks.returning.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await POST(request())).status).toBe(500);
    const retry = await POST(request());
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ deduped: false });
  });

  it('returns a retryable failure when lead lookup fails', async () => {
    mocks.limit.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('returns a retryable failure when the body stream fails', async () => {
    const req = request();
    vi.spyOn(req.body!, 'getReader').mockImplementationOnce(() => {
      throw new Error('body read failed');
    });
    expect((await POST(req)).status).toBe(500);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
