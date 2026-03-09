import { describe, expect, it, vi } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';

function createTxMock() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    tx: { update },
    update,
    set,
    where,
  };
}

describe('IngestionStatusManager', () => {
  it('markFailed writes failed status and error message', async () => {
    const { tx, update, set, where } = createTxMock();

    await IngestionStatusManager.markFailed(
      tx as never,
      'profile-1',
      'network timeout'
    );

    expect(update).toHaveBeenCalledWith(creatorProfiles);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        ingestionStatus: 'failed',
        lastIngestionError: 'network timeout',
        updatedAt: expect.any(Date),
      })
    );
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('markPendingBulk short-circuits on empty input', async () => {
    const { tx, update } = createTxMock();

    await IngestionStatusManager.markPendingBulk(tx as never, []);

    expect(update).not.toHaveBeenCalled();
  });

  it('handleStuckJobs short-circuits on empty profile list', async () => {
    const { tx, update } = createTxMock();

    await IngestionStatusManager.handleStuckJobs(tx as never, [], new Date());

    expect(update).not.toHaveBeenCalled();
  });

  it('markIdleOrFailed routes to idle when error is null', async () => {
    const markIdleSpy = vi
      .spyOn(IngestionStatusManager, 'markIdle')
      .mockResolvedValue(undefined);
    const markFailedSpy = vi
      .spyOn(IngestionStatusManager, 'markFailed')
      .mockResolvedValue(undefined);

    await IngestionStatusManager.markIdleOrFailed(
      {} as never,
      'profile-1',
      null
    );

    expect(markIdleSpy).toHaveBeenCalledWith({} as never, 'profile-1');
    expect(markFailedSpy).not.toHaveBeenCalled();

    markIdleSpy.mockRestore();
    markFailedSpy.mockRestore();
  });
});
