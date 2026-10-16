import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkArtistProfileConformance,
  readArtistProfileSources,
} from './artist-profile-conformance.mjs';

const prefix = 'apps/web/lib/';
const sources = readArtistProfileSources(process.cwd());
const fixtureSources = new Map(
  [...sources].filter(([path]) =>
    [
      'connectors/artist-profile-registry.ts',
      'connectors/registry.ts',
      'connectors/dsp-profile-catalog.ts',
      'dsp-bio-sync/providers.ts',
    ].some(suffix => path === `${prefix}${suffix}`)
  )
);
test('the complete current source tree conforms', () => {
  assert.deepEqual(checkArtistProfileConformance(sources), []);
});
for (const [name, path, source, expected] of [
  [
    'malformed provider source',
    'dsp-bio-sync/providers.ts',
    'export const DSP_BIO_PROVIDERS = { broken: ;',
    'invalid source syntax',
  ],
  [
    'untyped profile adapter',
    'connectors/new-social/profile.ts',
    "export const adapter = { manifest: { providerId: 'new-social' }, read() {}, write() {} };",
    'adapter manifest must select',
  ],

  [
    'ingestion destination',
    'ingestion/strategies/new-social.ts',
    'export const config = {};',
    'new-social lacks a ingestion manifest',
  ],
  [
    'profile adapter',
    'connectors/new-social/profile.ts',
    "import type { ProfileWriteAdapter } from '../profile-writes/contract'; export const adapter: ProfileWriteAdapter = { manifest: { providerId: 'new-social' } };",
    'adapter manifest must select',
  ],
  [
    'unregistered adapter factory call',
    'connectors/new-social/profile.ts',
    "import type { ProfileWriteAdapter } from '../profile-writes/contract'; import { getProfileWriteManifest } from '../profile-writes/manifest'; export const adapter: ProfileWriteAdapter = { manifest: getProfileWriteManifest('new-social') };",
    'new-social lacks a connector manifest',
  ],
  [
    'competing DSP metadata',
    'dsp-bio-sync/providers.ts',
    "export const DSP_BIO_PROVIDERS = { spotify: { enabled: true, rollback: 'manual', maxBioLength: 2 } };",
    'competing capability metadata enabled',
  ],
  [
    'DSP provider',
    'dsp-bio-sync/providers.ts',
    'export const DSP_BIO_PROVIDERS = { new_dsp: {} };',
    'new_dsp lacks a dsp_bio manifest',
  ],
  [
    'ingestion capability metadata',
    'ingestion/strategies/youtube.ts',
    'export const policy = { requiredScopes: ["write"], supportsWrite: true };',
    'competing capability metadata supportsWrite',
  ],
  [
    'connector destination',
    'connectors/registry.ts',
    "const registry = { new_social: { id: 'new_social', artistProfile: unknownArtistProfileContract('unknown') } };",
    'new_social lacks a connector manifest',
  ],
]) {
  test(`rejects a missing manifest or competing metadata: ${name}`, () => {
    const changed = new Map(fixtureSources);
    changed.set(`${prefix}${path}`, source);
    assert.ok(
      checkArtistProfileConformance(changed).some(error =>
        error.includes(expected)
      )
    );
  });
}
test('accepts an adapter selecting the registered factory', () => {
  const changed = new Map(fixtureSources);
  changed.set(
    `${prefix}connectors/spotify/profile.ts`,
    "import type { ProfileWriteAdapter } from '../profile-writes/contract'; import { getProfileWriteManifest } from '../profile-writes/manifest'; export const adapter: ProfileWriteAdapter = { manifest: getProfileWriteManifest('spotify') };"
  );
  assert.deepEqual(checkArtistProfileConformance(changed), []);
});
test('fails closed on an unreadable registry', () => {
  assert.deepEqual(checkArtistProfileConformance(new Map()), [
    'Missing artist-profile destination registry',
  ]);
});
