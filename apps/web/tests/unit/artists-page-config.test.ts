import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('/artists route segment config', () => {
  it('evaluates current discovery consent on every directory request', () => {
    // Robust path: resolve relative to this test file (not process.cwd()).
    // Prevents cwd-dependent breakage (package vs repo root invocation contexts).
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pagePath = resolve(__dirname, '../../app/artists/page.tsx');
    const pageSource = readFileSync(pagePath, 'utf8');

    // A Full Route Cache must not bypass the current owner discovery choice.
    expect(pageSource).toMatch(/export\s+const\s+revalidate\s*[=:]\s*0/);
    expect(pageSource).toMatch(
      /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"];?\s*$/m
    );
  });

  it('lists only claimed public profiles, never automatic unclaimed identities', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pagePath = resolve(__dirname, '../../app/artists/page.tsx');
    const catalogPath = resolve(
      __dirname,
      '../../lib/profile/public-discovery-catalog.ts'
    );
    const pageSource = readFileSync(pagePath, 'utf8');
    const catalogSource = readFileSync(catalogPath, 'utf8');

    expect(pageSource).toContain('loadArtistsDirectoryProfiles');
    expect(catalogSource).toContain('eq(creatorProfiles.isPublic, true)');
    expect(catalogSource).toContain('eq(creatorProfiles.isClaimed, true)');
    expect(catalogSource).toContain('filterPublicDiscoveryIdentities');
    expect(catalogSource).not.toContain('unstable_cache');
    expect(catalogSource).toContain('settings: creatorProfiles.settings');
  });
});
