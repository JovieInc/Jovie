import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import {
  backfillAudienceActionOwners,
  reconcileAudienceActionOwners,
} from '@/lib/db/audience-action-owners';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

vi.mock('@/lib/db/audience-action-owners', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db/audience-action-owners')>()),
  backfillAudienceActionOwners: vi.fn(),
  reconcileAudienceActionOwners: vi.fn(),
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(),
}));

const profileId = '11111111-1111-4111-8111-111111111111';
const cursor = '22222222-2222-4222-8222-222222222222';
const tx = {} as DbOrTransaction;
const batch = { scanned: 2, updated: 0, nextCursor: cursor };
const counts = { total: '9007199254740993', missing: '2', mismatched: '0' };
const originalArgv = process.argv;

describe('audience owner backfill command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(backfillAudienceActionOwners)
      .mockReset()
      .mockResolvedValue(batch);
    vi.mocked(reconcileAudienceActionOwners)
      .mockReset()
      .mockResolvedValue(counts);
    vi.mocked(withSystemIngestionSession)
      .mockReset()
      .mockImplementation(fn => fn(tx));
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  async function run(args: string[]) {
    process.argv = ['node', 'backfill-audience-action-owners.ts', ...args];
    await import('./backfill-audience-action-owners');
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalled());
  }

  it.each([
    {
      args: ['--profile-id', profileId],
      apply: false,
      cursor: null,
      limit: 100,
    },
    {
      args: [
        '--profile-id',
        profileId,
        '--apply',
        '--cursor',
        cursor,
        '--limit',
        '2',
      ],
      apply: true,
      cursor,
      limit: 2,
    },
  ])('runs one maintenance session and reports mode: $apply', async options => {
    await run(options.args);
    expect(withSystemIngestionSession).toHaveBeenCalledTimes(1);
    expect(backfillAudienceActionOwners).toHaveBeenCalledExactlyOnceWith(tx, {
      profileId,
      cursor: options.cursor,
      limit: options.limit,
      apply: options.apply,
    });
    expect(reconcileAudienceActionOwners).toHaveBeenCalledExactlyOnceWith(
      tx,
      profileId
    );
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        mode: options.apply ? 'apply' : 'dry-run',
        ...batch,
        ...counts,
      })
    );
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it.each([
    [],
    ['--profile-id', 'invalid'],
    ['--profile-id', profileId, '--cursor', 'invalid'],
    ['--profile-id', profileId, '--limit', '1001'],
    ['--profile-id', profileId, '--unknown'],
  ])(
    'rejects unsafe arguments before opening a maintenance session: %j',
    async (...args) => {
      await run(args);
      expect(withSystemIngestionSession).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledOnce();
      expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    }
  );

  it('reports a failed batch and never emits a success report', async () => {
    const error = new Error('statement timeout');
    vi.mocked(backfillAudienceActionOwners).mockRejectedValue(error);
    await run(['--profile-id', profileId, '--apply']);
    expect(reconcileAudienceActionOwners).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(error);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
