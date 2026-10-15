import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { backfillAudienceActionOwners } from './audience-action-owners';

const profileId = '11111111-1111-4111-8111-111111111111';
describe('audience owner backfill bounds', () => {
  it.each([0, -1, 1001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects unsafe batch size %s before querying',
    async limit => {
      const execute = vi.fn();
      await expect(
        backfillAudienceActionOwners(
          { execute } as unknown as DbOrTransaction,
          { profileId, limit }
        )
      ).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    }
  );
  it.each([{ profileId: 'invalid' }, { profileId, cursor: 'invalid' }])(
    'rejects malformed scope/cursor before querying',
    async options => {
      const execute = vi.fn();
      await expect(
        backfillAudienceActionOwners(
          { execute } as unknown as DbOrTransaction,
          options
        )
      ).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    }
  );
});
