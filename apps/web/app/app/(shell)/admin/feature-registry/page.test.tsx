import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReactNode } from 'react';
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
  buildFeatureReviewItems: vi.fn(),
  requireCurrentAdminPageAccess: vi.fn(),
  resolveAppPath: vi.fn(),
  resolveMonorepoPath: vi.fn(),
}));

vi.mock('@/components/features/admin/FounderReviewRegistry', () => ({
  FounderReviewRegistry: () => null,
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { readonly children: ReactNode }) => children,
}));
vi.mock('@/lib/admin/founder-review-registry', () => ({
  buildFeatureReviewItems: mocks.buildFeatureReviewItems,
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireCurrentAdminPageAccess,
}));
vi.mock('@/lib/filesystem-paths', () => ({
  resolveAppPath: mocks.resolveAppPath,
  resolveMonorepoPath: mocks.resolveMonorepoPath,
}));

import FeatureRegistryPage from './page';

describe('FeatureRegistryPage', () => {
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
    mocks.requireCurrentAdminPageAccess.mockResolvedValue('user_admin');
    mocks.buildFeatureReviewItems.mockReturnValue([]);
    mocks.resolveAppPath.mockReturnValue(runtimeRegistry);
    mocks.resolveMonorepoPath.mockReturnValue(monorepoRegistry);
  });

  it('reads the staged runtime registry used by deployed functions', async () => {
    await FeatureRegistryPage();

    expect(mocks.requireCurrentAdminPageAccess).toHaveBeenCalledOnce();
    expect(mocks.resolveAppPath).toHaveBeenCalledWith(
      'runtime-data',
      'docs',
      'FEATURE_REGISTRY.md'
    );
    expect(mocks.resolveMonorepoPath).toHaveBeenCalledWith(
      'docs',
      'FEATURE_REGISTRY.md'
    );
    expect(mocks.buildFeatureReviewItems).toHaveBeenCalledWith(
      'staged registry'
    );
  });

  it('falls back to the monorepo registry when runtime data is not staged', async () => {
    mocks.resolveAppPath.mockReturnValue(join(tempRoot, 'missing-runtime.md'));

    await FeatureRegistryPage();

    expect(mocks.buildFeatureReviewItems).toHaveBeenCalledWith(
      'local registry'
    );
  });

  it('does not hide filesystem failures other than a missing file', async () => {
    mocks.resolveAppPath.mockReturnValue(tempRoot);

    await expect(FeatureRegistryPage()).rejects.toMatchObject({
      code: 'EISDIR',
    });

    expect(mocks.buildFeatureReviewItems).not.toHaveBeenCalled();
  });

  it('reports every attempted path when neither registry exists', async () => {
    const missingRuntime = join(tempRoot, 'missing-runtime.md');
    const missingMonorepo = join(tempRoot, 'missing-monorepo.md');
    mocks.resolveAppPath.mockReturnValue(missingRuntime);
    mocks.resolveMonorepoPath.mockReturnValue(missingMonorepo);

    await expect(FeatureRegistryPage()).rejects.toThrow(
      `FEATURE_REGISTRY.md not found. Tried: ${missingRuntime}, ${missingMonorepo}`
    );

    expect(mocks.buildFeatureReviewItems).not.toHaveBeenCalled();
  });
});
