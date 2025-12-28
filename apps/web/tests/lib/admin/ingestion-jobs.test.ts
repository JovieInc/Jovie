import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
  doesTableExist: mockDoesTableExist,
  TABLE_NAMES: {
    ingestionJobs: 'ingestion_jobs',
  },
}));

vi.mock('@/lib/db/schema', () => ({
  ingestionJobs: {
    status: 'status',
  },
}));

describe('getIngestionJobStatusCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default counts when ingestion_jobs table does not exist', async () => {
    mockDoesTableExist.mockResolvedValue(false);

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      total: 0,
    });
    expect(mockDoesTableExist).toHaveBeenCalledWith('ingestion_jobs');
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns status counts when table exists with jobs', async () => {
    mockDoesTableExist.mockResolvedValue(true);

    const mockFrom = vi.fn().mockReturnThis();
    const mockGroupBy = vi.fn().mockResolvedValue([
      { status: 'pending', count: 5 },
      { status: 'processing', count: 3 },
      { status: 'succeeded', count: 100 },
      { status: 'failed', count: 2 },
    ]);

    mockDbSelect.mockReturnValue({
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      groupBy: mockGroupBy,
    });

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 5,
      processing: 3,
      succeeded: 100,
      failed: 2,
      total: 110,
    });
    expect(mockDoesTableExist).toHaveBeenCalledWith('ingestion_jobs');
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it('returns empty counts when table exists but has no jobs', async () => {
    mockDoesTableExist.mockResolvedValue(true);

    const mockFrom = vi.fn().mockReturnThis();
    const mockGroupBy = vi.fn().mockResolvedValue([]);

    mockDbSelect.mockReturnValue({
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      groupBy: mockGroupBy,
    });

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      total: 0,
    });
  });

  it('returns partial counts when only some statuses have jobs', async () => {
    mockDoesTableExist.mockResolvedValue(true);

    const mockFrom = vi.fn().mockReturnThis();
    const mockGroupBy = vi.fn().mockResolvedValue([
      { status: 'succeeded', count: 50 },
      { status: 'failed', count: 10 },
    ]);

    mockDbSelect.mockReturnValue({
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      groupBy: mockGroupBy,
    });

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 0,
      processing: 0,
      succeeded: 50,
      failed: 10,
      total: 60,
    });
  });

  it('returns default counts and logs error on database error', async () => {
    mockDoesTableExist.mockResolvedValue(true);

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const mockFrom = vi.fn().mockReturnThis();
    const mockGroupBy = vi
      .fn()
      .mockRejectedValue(new Error('Database connection failed'));

    mockDbSelect.mockReturnValue({
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      groupBy: mockGroupBy,
    });

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      total: 0,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error loading ingestion job status counts',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles null count values gracefully', async () => {
    mockDoesTableExist.mockResolvedValue(true);

    const mockFrom = vi.fn().mockReturnThis();
    const mockGroupBy = vi.fn().mockResolvedValue([
      { status: 'pending', count: null },
      { status: 'succeeded', count: 25 },
    ]);

    mockDbSelect.mockReturnValue({
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      groupBy: mockGroupBy,
    });

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 0,
      processing: 0,
      succeeded: 25,
      failed: 0,
      total: 25,
    });
  });

  it('handles string count values by converting to numbers', async () => {
    mockDoesTableExist.mockResolvedValue(true);

    const mockFrom = vi.fn().mockReturnThis();
    const mockGroupBy = vi.fn().mockResolvedValue([
      { status: 'pending', count: '15' },
      { status: 'processing', count: '8' },
    ]);

    mockDbSelect.mockReturnValue({
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      groupBy: mockGroupBy,
    });

    const { getIngestionJobStatusCounts } = await import(
      '@/lib/admin/overview'
    );
    const result = await getIngestionJobStatusCounts();

    expect(result).toEqual({
      pending: 15,
      processing: 8,
      succeeded: 0,
      failed: 0,
      total: 23,
    });
  });
});
