import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  conflict: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (value: unknown) => {
        mocks.values(value);
        return {
          onConflictDoUpdate: (config: unknown) => {
            mocks.conflict(config);
            return { returning: async () => [{ id: 'release-1' }] };
          },
        };
      },
    }),
  },
}));

import { upsertRelease } from './queries';

const base = {
  creatorProfileId: 'profile-1',
  title: 'Signal Fire',
  slug: 'signal-fire',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('upsertRelease status', () => {
  it('inserts the requested status (agent drafts start as draft)', async () => {
    await upsertRelease({ ...base, status: 'draft' });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' })
    );
  });

  it('leaves the column default for callers that omit status', async () => {
    await upsertRelease(base);
    expect(mocks.values.mock.calls[0]?.[0]).not.toHaveProperty('status');
  });

  it('never rewrites the status of an existing release on conflict', async () => {
    await upsertRelease({ ...base, status: 'draft' });
    const config = mocks.conflict.mock.calls[0]?.[0] as {
      set: Record<string, unknown>;
    };
    expect(config.set).not.toHaveProperty('status');
  });
});
