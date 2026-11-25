import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStagingVersionTransition } from '../../../scripts/desktop-release-assets.mjs';
import {
  deriveStagingReleaseVersion,
  resolveDesktopVersion,
} from './sync-version.mjs';

const INSTALLED_VERSION = '26.8.1';

test('staging versions are monotonic, next-patch, and staging-only', () => {
  const installedVersion = INSTALLED_VERSION;
  for (const [runId, attempt, expected] of [
    ['17823456789', '1', '26.8.2-staging.17823456789.1'],
    ['17823456790', '1', '26.8.2-staging.17823456790.1'],
    ['17823456789', '2', '26.8.2-staging.17823456789.2'],
  ]) {
    assert.equal(
      deriveStagingReleaseVersion(installedVersion, runId, attempt),
      expected
    );
  }
  for (const args of [
    ['26.8.1-staging.1', '1200', '1'],
    ['26.8.1', '0', '1'],
    ['26.8.1', '1200', 'latest'],
  ]) {
    assert.throws(() => deriveStagingReleaseVersion(...args));
  }
  assert.doesNotThrow(() =>
    assertStagingVersionTransition({
      installedVersion,
      currentFeedVersion: '26.8.2-staging.17823456789.1',
      version: '26.8.2-staging.17823456790.1',
    })
  );
  for (const [version, currentFeedVersion, error] of [
    [
      '26.8.2-staging.17823456789.1',
      '26.8.2-staging.17823456790.1',
      /not newer/,
    ],
    ['26.8.1-staging.17823456791.1', undefined, /next-patch/],
    ['26.8.1+staging.17823456791.1', undefined, /valid prerelease/],
  ]) {
    assert.throws(
      () =>
        assertStagingVersionTransition({
          installedVersion,
          currentFeedVersion,
          version,
        }),
      error
    );
  }
});

test('desktop version override is staging-only and next-patch exact', () => {
  const input = {
    repoVersion: INSTALLED_VERSION,
    electronEnv: 'staging',
    desktopVersion: '26.8.2-staging.17823456789.1',
  };
  assert.equal(resolveDesktopVersion(input), input.desktopVersion);
  assert.equal(
    resolveDesktopVersion({
      repoVersion: INSTALLED_VERSION,
      electronEnv: 'production',
    }),
    INSTALLED_VERSION
  );
  for (const [override, error] of [
    [{ ...input, electronEnv: 'production' }, /allowed only for staging/],
    [
      { ...input, desktopVersion: '26.8.1-staging.17823456789.1' },
      /must be a 26\.8\.2-staging/,
    ],
    [
      { repoVersion: INSTALLED_VERSION, electronEnv: 'staging' },
      /required for staging/,
    ],
  ])
    assert.throws(() => resolveDesktopVersion(override), error);
});
