import { describe, expect, test } from 'vitest';
import {
  DESKTOP_BUILD_IDENTITY_COPY_CONTROL_ID,
  DESKTOP_BUILD_IDENTITY_UNAVAILABLE,
  formatDesktopBuildIdentityDisplay,
  parseDesktopBuildIdentityRecord,
  renderDesktopBuildIdentitySection,
  resolveDesktopBuildIdentity,
  toDesktopBuildIdentityJson,
} from '../src/build-identity.ts';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BUILT = '2026-08-30T21:00:00.000Z';
const baked = {
  channel: 'production' as const,
  version: '26.8.1',
  sourceRevision: SHA,
  builtAt: BUILT,
};

function resolve(overrides = {}) {
  return resolveDesktopBuildIdentity({
    baked,
    runtimeChannel: 'production',
    runtimeVersion: '26.8.1',
    packaged: true,
    packagedRecord: baked,
    ...overrides,
  });
}

test('parses the four-field contract and rejects extra or malformed fields', () => {
  expect(parseDesktopBuildIdentityRecord(baked)).toEqual(baked);
  expect(
    parseDesktopBuildIdentityRecord({ ...baked, githubToken: 'ghs_secret' })
  ).toBeNull();
  expect(
    parseDesktopBuildIdentityRecord({
      ...baked,
      sourceRevision: SHA.slice(0, 7),
    })
  ).toBeNull();
  expect(
    parseDesktopBuildIdentityRecord({ ...baked, builtAt: 'August 30 2026' })
  ).toBeNull();
});

test('matching packaged production identity is verified and copyable', () => {
  const identity = resolve();
  expect(identity.provenance).toBe('verified');
  const copy = formatDesktopBuildIdentityDisplay(identity);
  expect(copy).toMatch(
    new RegExp(
      `channel: production\\nversion: 26.8.1\\nrevision: ${SHA}\\nbuilt: ${BUILT}\\nprovenance: verified`
    )
  );
  const html = renderDesktopBuildIdentitySection(identity);
  expect(html).toContain(`id="${DESKTOP_BUILD_IDENTITY_COPY_CONTROL_ID}"`);
  expect(html).toContain('aria-label="Copy build identity"');
  expect(`${copy}\n${toDesktopBuildIdentityJson(identity)}`).not.toMatch(
    /secret|password|token|credential|ghs_|sk_/i
  );
});

test('development builds keep revision and mark build time unavailable', () => {
  const local = {
    channel: 'local' as const,
    version: '26.8.1',
    sourceRevision: SHA,
    builtAt: null,
  };
  const copy = formatDesktopBuildIdentityDisplay(
    resolve({
      baked: local,
      runtimeChannel: 'local',
      packaged: false,
      packagedRecord: null,
    })
  );
  expect(copy).toContain(`built: ${DESKTOP_BUILD_IDENTITY_UNAVAILABLE}`);
  expect(copy).toContain('development (build time unavailable)');
  expect(copy).not.toContain('provenance: verified');
});

describe('deliberate-red: unknown or mismatched provenance cannot be verified', () => {
  test.each([
    {
      name: 'mismatched extraResource',
      overrides: {
        packagedRecord: { ...baked, sourceRevision: SHA.replaceAll('a', 'b') },
      },
    },
    { name: 'missing extraResource', overrides: { packagedRecord: null } },
    { name: 'runtime version drift', overrides: { runtimeVersion: '26.8.0' } },
    { name: 'unknown baked record', overrides: { baked: { not: 'identity' } } },
    {
      name: 'incomplete packaged staging',
      overrides: {
        baked: {
          channel: 'staging' as const,
          version: '26.8.1',
          sourceRevision: SHA,
          builtAt: null,
        },
        runtimeChannel: 'staging',
        packagedRecord: {
          channel: 'staging' as const,
          version: '26.8.1',
          sourceRevision: SHA,
          builtAt: null,
        },
      },
    },
  ])('$name', ({ overrides }) => {
    expect(resolve(overrides).provenance).toBe('unverified');
    expect(formatDesktopBuildIdentityDisplay(resolve(overrides))).not.toMatch(
      /provenance: verified$/m
    );
  });
});
