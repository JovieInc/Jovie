import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockClaimPendingJobs = vi.hoisted(() => vi.fn());
const mockProcessJob = vi.hoisted(() => vi.fn());
const mockSucceedJob = vi.hoisted(() => vi.fn());
const mockHandleIngestionJobFailure = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
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

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('GET /api/cron/process-ingestion-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');

    mockClaimPendingJobs.mockResolvedValue([
      { id: 'job_1', jobType: 'musicfetch', attempts: 0 },
    ]);
    mockProcessJob.mockResolvedValue(undefined);
    mockSucceedJob.mockResolvedValue(undefined);
    mockHandleIngestionJobFailure.mockResolvedValue(undefined);
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback({})
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/process-ingestion-jobs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-ingestion-jobs', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('processes claimed jobs with valid auth', async () => {
    const { GET } = await import('@/app/api/cron/process-ingestion-jobs/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-ingestion-jobs', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      attempted: 1,
      processed: 1,
      errors: [],
    });
  });
});
