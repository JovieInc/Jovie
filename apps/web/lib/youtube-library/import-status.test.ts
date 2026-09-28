import { describe, expect, it } from 'vitest';
import { addYouTubeImportReason } from './import-status';

describe('addYouTubeImportReason', () => {
  it('adds a reason and then adds to its count', () => {
    const added = addYouTubeImportReason([], 'quota', 2);
    expect(added).toEqual([{ code: 'quota', count: 2 }]);

    expect(addYouTubeImportReason(added, 'quota', 3)).toEqual([
      { code: 'quota', count: 5 },
    ]);
    expect(addYouTubeImportReason(added, 'missing_id', 1)).toEqual([
      { code: 'quota', count: 2 },
      { code: 'missing_id', count: 1 },
    ]);
  });

  it('leaves the list unchanged when the count is not positive', () => {
    const reasons = [{ code: 'quota' as const, count: 2 }];
    expect(addYouTubeImportReason(reasons, 'quota', 0)).toEqual(reasons);
    expect(addYouTubeImportReason(reasons, 'quota', 0)).not.toBe(reasons);
  });
});
