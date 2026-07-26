import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getPublicSurfaceManifestForRuntimeSync } from '../../e2e/utils/public-surface-manifest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../../../..');
const webWorkspace = resolve(repositoryRoot, 'apps/web');

describe('visual CI harness', () => {
  it('keeps the Chromatic config reachable from the filtered web workspace', () => {
    const configPath = resolve(webWorkspace, '../../chromatic.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      onlyChanged?: boolean;
      projectId?: string;
      zip?: boolean;
    };

    expect(configPath).toBe(resolve(repositoryRoot, 'chromatic.config.json'));
    expect(config).toEqual({
      onlyChanged: true,
      projectId: 'Project:68a7da03dd53297b6349f724',
      zip: true,
    });
  });

  it('keeps database-backed redirects out of DB-free visual smoke', () => {
    const withoutDatabase = getPublicSurfaceManifestForRuntimeSync({
      database: false,
    }).map(surface => surface.id);
    const withDatabase = getPublicSurfaceManifestForRuntimeSync({
      database: true,
    }).map(surface => surface.id);

    expect(withoutDatabase).not.toContain('profile-shop');
    expect(withoutDatabase).not.toContain('profile-claim');
    expect(withDatabase).toContain('profile-shop');
    expect(withDatabase).toContain('profile-claim');
  });
});
