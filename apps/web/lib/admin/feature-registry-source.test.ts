import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveAppPath: vi.fn(),
  resolveMonorepoPath: vi.fn(),
}));

vi.mock('@/lib/filesystem-paths', () => ({
  resolveAppPath: mocks.resolveAppPath,
  resolveMonorepoPath: mocks.resolveMonorepoPath,
}));

import { loadFeatureRegistryMarkdown } from './feature-registry-source';

describe('feature registry source', () => {
  let tempRoot: string;
  let runtimeRegistry: string;
  let monorepoRegistry: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'jovie-feature-registry-'));
    runtimeRegistry = join(tempRoot, 'runtime-registry.md');
    monorepoRegistry = join(tempRoot, 'monorepo-registry.md');
    await Promise.all([
      writeFile(runtimeRegistry, 'staged registry'),
      writeFile(monorepoRegistry, 'local registry'),
    ]);
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAppPath.mockReturnValue(runtimeRegistry);
    mocks.resolveMonorepoPath.mockReturnValue(monorepoRegistry);
  });

  it('reads the staged runtime registry used by deployed functions', async () => {
    await loadFeatureRegistryMarkdown();

    expect(mocks.resolveAppPath).toHaveBeenCalledWith(
      'runtime-data',
      'docs',
      'FEATURE_REGISTRY.md'
    );
    expect(mocks.resolveMonorepoPath).toHaveBeenCalledWith(
      'docs',
      'FEATURE_REGISTRY.md'
    );
    expect(await loadFeatureRegistryMarkdown()).toBe('staged registry');
  });

  it('falls back to the monorepo registry when runtime data is not staged', async () => {
    mocks.resolveAppPath.mockReturnValue(join(tempRoot, 'missing-runtime.md'));

    await loadFeatureRegistryMarkdown();

    expect(await loadFeatureRegistryMarkdown()).toBe('local registry');
  });

  it('does not hide filesystem failures other than a missing file', async () => {
    mocks.resolveAppPath.mockReturnValue(tempRoot);

    await expect(loadFeatureRegistryMarkdown()).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });

  it('reports every attempted path when neither registry exists', async () => {
    const missingRuntime = join(tempRoot, 'missing-runtime.md');
    const missingMonorepo = join(tempRoot, 'missing-monorepo.md');
    mocks.resolveAppPath.mockReturnValue(missingRuntime);
    mocks.resolveMonorepoPath.mockReturnValue(missingMonorepo);

    await expect(loadFeatureRegistryMarkdown()).rejects.toThrow(
      `FEATURE_REGISTRY.md not found. Tried: ${missingRuntime}, ${missingMonorepo}`
    );
  });
});
