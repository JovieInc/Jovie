import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunDataRetentionCleanup = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics/data-retention', () => ({
  runDataRetentionCleanup: mockRunDataRetentionCleanup,
}));

describe('GET /api/cron/data-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without proper authorization', async () => {
    const { GET } = await import('@/app/api/cron/data-retention/route');
    const request = new NextRequest(
      'http://localhost/api/cron/data-retention',
      {
        headers: {
          Authorization: 'Bearer wrong-secret',
          'x-vercel-cron': '1',
        },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('runs data retention cleanup', async () => {
    mockRunDataRetentionCleanup.mockResolvedValue({
      clickEventsDeleted: 10,
      audienceMembersDeleted: 5,
      notificationSubscriptionsDeleted: 2,
      pixelEventsDeleted: 3,
      stripeWebhookEventsDeleted: 1,
      webhookEventsDeleted: 0,
      notificationDeliveryLogDeleted: 4,
      emailEngagementDeleted: 2,
      chatMessagesDeleted: 0,
      chatAuditLogDeleted: 0,
      billingAuditLogDeleted: 1,
      adminAuditLogDeleted: 0,
      ingestionJobsDeleted: 0,
      unsubscribeTokensDeleted: 0,
      emailSendAttributionDeleted: 0,
      emailSuppressionsDeleted: 0,
      duration: 100,
      retentionDays: 90,
      cutoffDate: new Date(),
      chatCutoffDate: new Date(),
    });

    const { GET } = await import('@/app/api/cron/data-retention/route');
    const request = new NextRequest(
      'http://localhost/api/cron/data-retention',
      {
        headers: {
          Authorization: 'Bearer test-secret',
          'x-vercel-cron': '1',
        },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.result).toBeDefined();
  });
});
