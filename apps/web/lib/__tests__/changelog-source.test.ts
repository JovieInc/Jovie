import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  exists: vi.fn(),
  parse: vi.fn(),
  parseDocument: vi.fn(),
}));
vi.mock('node:fs', () => ({
  default: { readFileSync: mocks.read, existsSync: mocks.exists },
}));
vi.mock('next/cache', () => ({
  unstable_cache: (load: () => Promise<string>) => {
    let cached: Promise<string> | undefined;
    return () => (cached ??= load());
  },
}));
vi.mock('../filesystem-paths', () => ({
  resolveAppPath: () => '/fixture/apps/web/runtime-data/CHANGELOG.md',
  resolveMonorepoPath: () => '/fixture/CHANGELOG.md',
}));
vi.mock('../changelog-parser', () => ({
  parseChangelog: mocks.parse,
  parseChangelogDocument: mocks.parseDocument,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.exists.mockReturnValue(true);
});

it('caches markdown but reapplies current filtering policy for every read', async () => {
  mocks.read.mockReturnValue('release source');
  mocks.parse
    .mockReturnValueOnce([{ version: 'first policy' }])
    .mockReturnValueOnce([]);
  const { getChangelogReleases } = await import('../changelog-source');
  expect(await getChangelogReleases()).toEqual([{ version: 'first policy' }]);
  expect(await getChangelogReleases()).toEqual([]);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.parse).toHaveBeenCalledTimes(2);
  expect(mocks.parse).toHaveBeenLastCalledWith('release source');
});

it('fails closed to empty source when the source file is missing', async () => {
  mocks.exists.mockReturnValue(false);
  mocks.parse.mockReturnValue([]);
  const { getChangelogReleases } = await import('../changelog-source');
  expect(await getChangelogReleases()).toEqual([]);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.parse).toHaveBeenCalledWith('');
});

it('returns source headings and public releases together for freshness UI', async () => {
  mocks.read.mockReturnValue('release source');
  const parsed = {
    releases: [{ version: '26.8.2' }],
    sourceReleases: [{ version: '26.9.0' }, { version: '26.8.2' }],
    unpublishedReleases: [{ version: '26.9.0' }],
  };
  mocks.parseDocument.mockReturnValue(parsed);

  const { getChangelogSnapshot } = await import('../changelog-source');

  await expect(getChangelogSnapshot()).resolves.toEqual(parsed);
  expect(mocks.parseDocument).toHaveBeenCalledWith('release source');
});
