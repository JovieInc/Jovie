import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockClaimPendingJobs,
  mockGetOperationalControls,
  mockHandleIngestionJobFailure,
  mockLoggerError,
  mockProcessJob,
  mockSucceedJob,
  mockVerifyCronRequest,
  mockWithSystemIngestionSession,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockClaimPendingJobs: vi.fn(),
  mockGetOperationalControls: vi.fn(),
  mockHandleIngestionJobFailure: vi.fn(),
  mockLoggerError: vi.fn(),
  mockProcessJob: vi.fn(),
  mockSucceedJob: vi.fn(),
  mockVerifyCronRequest: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: vi.fn(() => 'check-in-id'),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/ingestion/processor', () => ({
  claimPendingJobs: mockClaimPendingJobs,
  handleIngestionJobFailure: mockHandleIngestionJobFailure,
  processJob: mockProcessJob,
  succeedJob: mockSucceedJob,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/admin/operational-controls', () => ({
  getOperationalControls: mockGetOperationalControls,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

describe('GET /api/cron/process-ingestion-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockVerifyCronRequest.mockReturnValue(null);
    mockGetOperationalControls.mockResolvedValue({
      signupEnabled: true,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      updatedAt: null,
      updatedByUserId: null,
    });
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback({})
    );
    mockClaimPendingJobs.mockResolvedValue([
      { id: 'job_1', jobType: 'musicfetch', attempts: 0 },
    ]);
    mockProcessJob.mockResolvedValue(undefined);
    mockSucceedJob.mockResolvedValue(undefined);
    mockHandleIngestionJobFailure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the cron auth failure response directly', async () => {
    mockVerifyCronRequest.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/cron/process-ingestion-jobs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-ingestion-jobs')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('processes claimed jobs and returns an empty errors array on success', async () => {
    const { GET } = await import('@/app/api/cron/process-ingestion-jobs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-ingestion-jobs')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      attempted: 1,
      processed: 1,
      errors: [],
    });
  });

  it('includes failed job messages in the returned errors array', async () => {
    mockClaimPendingJobs.mockResolvedValueOnce([
      { id: 'job_1', jobType: 'musicfetch', attempts: 0 },
      { id: 'job_2', jobType: 'spotify', attempts: 1 },
    ]);
    mockProcessJob
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timed out'));

    const { GET } = await import('@/app/api/cron/process-ingestion-jobs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-ingestion-jobs')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      attempted: 2,
      processed: 1,
      errors: ['Job job_2: timed out'],
    });
    expect(mockHandleIngestionJobFailure).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'job_2' }),
      expect.any(Error)
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job failed',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/cron/process-ingestion-jobs',
        jobId: 'job_2',
        jobType: 'spotify',
        attempts: 1,
      })
    );
  });

  it('returns 500 when claiming jobs crashes at the top level', async () => {
    const crash = new Error('claim crashed');
    mockWithSystemIngestionSession.mockRejectedValueOnce(crash);

    const { GET } = await import('@/app/api/cron/process-ingestion-jobs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-ingestion-jobs')
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to process ingestion jobs',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion cron processing failed',
      crash,
      expect.objectContaining({
        route: '/api/cron/process-ingestion-jobs',
        method: 'GET',
      })
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
