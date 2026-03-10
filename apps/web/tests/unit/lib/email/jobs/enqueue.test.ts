import { describe, expect, it, vi } from 'vitest';
import {
  enqueueBulkClaimInviteJobs,
  enqueueClaimInviteJob,
} from '@/lib/email/jobs/enqueue';

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('email job enqueue conflict handling', () => {
  it('uses generic ON CONFLICT DO NOTHING for single insert', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'job_1' }]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));

    const tx = { insert } as never;

    await enqueueClaimInviteJob(tx, {
      inviteId: 'invite_1',
      creatorProfileId: 'creator_1',
    });

    expect(onConflictDoNothing).toHaveBeenCalledWith();
  });

  it('uses generic ON CONFLICT DO NOTHING for batch insert', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'job_1' }]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));

    const tx = { insert } as never;

    await enqueueBulkClaimInviteJobs(tx, [
      {
        inviteId: 'invite_1',
        creatorProfileId: 'creator_1',
      },
    ]);

    expect(onConflictDoNothing).toHaveBeenCalledWith();
  });
});
