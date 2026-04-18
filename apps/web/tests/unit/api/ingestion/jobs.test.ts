import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockClaimPendingJobs,
  mockHandleIngestionJobFailure,
  mockLoggerError,
  mockProcessJob,
  mockSucceedJob,
  mockWithSystemIngestionSession,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockClaimPendingJobs: vi.fn(),
  mockHandleIngestionJobFailure: vi.fn(),
  mockLoggerError: vi.fn(),
  mockProcessJob: vi.fn(),
  mockSucceedJob: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
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

vi.mock('@/lib/env-server', () => ({
  env: { INGESTION_CRON_SECRET: 'test-secret', CRON_SECRET: 'test-secret' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mockLoggerError },
}));

describe('POST /api/ingestion/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback({})
    );
    mockClaimPendingJobs.mockResolvedValue([]);
    mockProcessJob.mockResolvedValue(undefined);
    mockSucceedJob.mockResolvedValue(undefined);
    mockHandleIngestionJobFailure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without authorization', async () => {
    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ingestion/jobs', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for the wrong secret', async () => {
    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ingestion/jobs', {
        method: 'POST',
        headers: { 'x-ingestion-secret': 'wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('processes successful jobs and captures partial-success warnings', async () => {
    mockClaimPendingJobs.mockResolvedValueOnce([
      { id: 'job_1', jobType: 'musicfetch', attempts: 0 },
    ]);
    mockProcessJob.mockResolvedValueOnce({ errors: ['avatar upload failed'] });

    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ingestion/jobs', {
        method: 'POST',
        headers: { 'x-ingestion-secret': 'test-secret' },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, attempted: 1, processed: 1 });
    expect(mockSucceedJob).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'job_1' })
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job succeeded with errors',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/ingestion/jobs',
        jobId: 'job_1',
        jobType: 'musicfetch',
      })
    );
  });

  it('records failed jobs without claiming success for them', async () => {
    mockClaimPendingJobs.mockResolvedValueOnce([
      { id: 'job_1', jobType: 'musicfetch', attempts: 0 },
      { id: 'job_2', jobType: 'spotify', attempts: 2 },
    ]);
    mockProcessJob
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('provider timeout'));

    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ingestion/jobs', {
        method: 'POST',
        headers: { 'x-ingestion-secret': 'test-secret' },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, attempted: 2, processed: 1 });
    expect(mockHandleIngestionJobFailure).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'job_2' }),
      expect.any(Error)
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job failed',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/ingestion/jobs',
        jobId: 'job_2',
        jobType: 'spotify',
        attempts: 2,
      })
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('returns 500 when claiming pending jobs fails', async () => {
    const crash = new Error('claim failed');
    mockWithSystemIngestionSession.mockRejectedValueOnce(crash);

    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ingestion/jobs', {
        method: 'POST',
        headers: { 'x-ingestion-secret': 'test-secret' },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to process ingestion jobs',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job processing failed',
      crash,
      expect.objectContaining({
        route: '/api/ingestion/jobs',
        method: 'POST',
      })
    );
  });
});
