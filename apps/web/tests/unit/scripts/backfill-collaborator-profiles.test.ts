import { describe, expect, it } from 'vitest';
import { parseBackfillArgs } from '../../../scripts/backfill-collaborator-profiles';

const profileId = '8473a72f-51a0-4ce0-8739-4facfd89a7a5';

describe('collaborator profile backfill arguments', () => {
  it('is dry-run-first and bounded by default', () => {
    expect(parseBackfillArgs([])).toEqual({
      dryRun: true,
      limit: 10,
      cursor: null,
      profileId: null,
    });
  });

  it('supports an explicit targeted apply run', () => {
    expect(
      parseBackfillArgs(['--', '--apply', '--profile-id', profileId])
    ).toEqual({
      dryRun: false,
      limit: 10,
      cursor: null,
      profileId,
    });
  });

  it('rejects ambiguous modes, invalid limits, and mixed cursors', () => {
    expect(() => parseBackfillArgs(['--apply', '--dry-run'])).toThrow(
      'Choose either --dry-run or --apply'
    );
    expect(() => parseBackfillArgs(['--limit', '101'])).toThrow(
      '--limit must be an integer between 1 and 100'
    );
    expect(() =>
      parseBackfillArgs(['--profile-id', profileId, '--cursor', profileId])
    ).toThrow('--cursor cannot be combined with --profile-id');
  });
});
