import { describe, expect, it } from 'vitest';

import { createReleaseManifest, resolveReleaseVersion } from './pack-manifest';

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

  it('rejects a source manifest pinned to a different CLI release', () => {
    expect(() =>
      createReleaseManifest('{"version":"26.9.16"}', '26.10.0')
    ).toThrow('does not match');
  });

  it.each(['26.10.00', '26.13.0', '26.10.0-rc.1', '26.10.0+cli'])(
    'rejects unsupported stable CalVer %s',
    version => {
      expect(() => createReleaseManifest('{}', version)).toThrow('YY.M.PATCH');
    }
  );

  it('rejects an empty release version', () => {
    expect(() => createReleaseManifest('{}', '  ')).toThrow(
      'A release version is required'
    );
  });
});

describe('CLI release version selection', () => {
  it('uses a canonical newline-terminated stamp when no version is selected', () => {
    expect(resolveReleaseVersion('26.9.16\n')).toBe('26.9.16');
    expect(resolveReleaseVersion('26.9.16\n', '')).toBe('26.9.16');
  });

  it('selects an independent stable version without mutating the stamp', () => {
    const canonical = '26.9.16\n';
    expect(resolveReleaseVersion(canonical, '26.10.0')).toBe('26.10.0');
    expect(canonical).toBe('26.9.16\n');
  });

  it('accepts matching manifest versions and rejects explicit invalid pins', () => {
    expect(
      JSON.parse(createReleaseManifest('{"version":"26.10.0"}', '26.10.0'))
        .version
    ).toBe('26.10.0');
    expect(() => createReleaseManifest('{"version":""}', '26.10.0')).toThrow(
      'does not match'
    );
  });

  it.each(['null', '[]', '42'])(
    'rejects a non-object manifest %s',
    manifest => {
      expect(() => createReleaseManifest(manifest, '26.10.0')).toThrow(
        'JSON object'
      );
    }
  );

  it('rejects a malformed canonical fallback and accepts the last safe patch', () => {
    expect(() => resolveReleaseVersion('26.0.0')).toThrow('YY.M.PATCH');
    expect(resolveReleaseVersion('26.12.9007199254740991')).toBe(
      '26.12.9007199254740991'
    );
  });
});
