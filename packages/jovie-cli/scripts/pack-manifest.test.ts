import { describe, expect, it } from 'vitest';

import { createReleaseManifest } from './pack-manifest';

describe('release pack manifest', () => {
  it('adds the release version without changing the source manifest', () => {
    const source = JSON.stringify({
      name: '@jovie/cli',
      private: false,
      license: 'Apache-2.0',
      publishConfig: {
        access: 'public',
        provenance: true,
        registry: 'https://registry.npmjs.org',
      },
    });

    const packed = createReleaseManifest(source, '26.8.1\n');

    expect(JSON.parse(packed)).toMatchObject({
      name: '@jovie/cli',
      private: false,
      license: 'Apache-2.0',
      publishConfig: {
        access: 'public',
        provenance: true,
        registry: 'https://registry.npmjs.org',
      },
      version: '26.8.1',
    });
    expect(JSON.parse(source)).not.toHaveProperty('version');
  });

  it('rejects an empty release version', () => {
    expect(() => createReleaseManifest('{}', '  ')).toThrow(
      'A release version is required'
    );
  });
});
