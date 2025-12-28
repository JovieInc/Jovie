import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockClaimPendingJobs = vi.hoisted(() => vi.fn());
const mockProcessJob = vi.hoisted(() => vi.fn());
const mockSucceedJob = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ingestion/processor', () => ({
  claimPendingJobs: mockClaimPendingJobs,
  handleIngestionJobFailure: vi.fn(),
  processJob: mockProcessJob,
  succeedJob: mockSucceedJob,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/env-server', () => ({
  env: { INGESTION_CRON_SECRET: 'test-secret' },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('POST /api/ingestion/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without proper authorization', async () => {
    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const request = new NextRequest('http://localhost/api/ingestion/jobs', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('processes ingestion jobs with proper authorization', async () => {
    mockWithSystemIngestionSession.mockImplementation(async fn => fn({}));
    mockClaimPendingJobs.mockResolvedValue([]);

    const { POST } = await import('@/app/api/ingestion/jobs/route');
    const request = new NextRequest('http://localhost/api/ingestion/jobs', {
      method: 'POST',
      headers: { 'x-ingestion-secret': 'test-secret' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.attempted).toBe(0);
    expect(data.processed).toBe(0);
  });
});
