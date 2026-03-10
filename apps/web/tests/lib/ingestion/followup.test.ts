import { describe, expect, it, vi } from 'vitest';
import { enqueueFollowupIngestionJobs } from '@/lib/ingestion/followup';

function createTxMock() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn((jobValues: unknown[]) => {
    void jobValues;
    return { onConflictDoNothing };
  });
  const insert = vi.fn(() => ({ values }));

  return {
    tx: { insert },
    insert,
    values,
    onConflictDoNothing,
  };
}

describe('enqueueFollowupIngestionJobs', () => {
  it('skips insert when extraction has no supported links', async () => {
    const { tx, insert } = createTxMock();

    await enqueueFollowupIngestionJobs({
      tx: tx as never,
      creatorProfileId: '7e093f2b-a8f9-4559-a9df-8f789b4432f8',
      currentDepth: 0,
      extraction: {
        links: [{ url: 'https://example.com/nope' }],
      },
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it('enqueues only links still within max depth', async () => {
    const { tx, insert, values, onConflictDoNothing } = createTxMock();

    await enqueueFollowupIngestionJobs({
      tx: tx as never,
      creatorProfileId: '7e093f2b-a8f9-4559-a9df-8f789b4432f8',
      currentDepth: 2,
      extraction: {
        links: [
          { url: 'https://instagram.com/example_artist' },
          { url: 'https://youtube.com/@artistchannel' },
          { url: 'https://beacons.ai/exampleartist' },
        ],
      },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);

    const payload = values.mock.calls[0]?.[0];
    expect(Array.isArray(payload)).toBe(true);

    expect(payload).toEqual([
      expect.objectContaining({
        jobType: 'import_beacons',
        payload: expect.objectContaining({
          creatorProfileId: '7e093f2b-a8f9-4559-a9df-8f789b4432f8',
          depth: 3,
        }),
        status: 'pending',
      }),
    ]);

    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(onConflictDoNothing).toHaveBeenCalledWith();
  });
});
