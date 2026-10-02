import { describe, expect, it } from 'vitest';

import {
  ADVANCED_SETTINGS_FIELDS,
  CHANNEL_SWITCH_POLICY,
  CUSTOMER_SETTINGS_FIELDS,
  isReleaseChannel,
  RELEASE_CHANNEL_LABELS,
  RELEASE_CHANNELS,
  releaseChannelForDesktopFeed,
  releaseChannelForIosProvenance,
} from './index';

describe('canonical channel vocabulary', () => {
  it('defines exactly stable, beta, and nightly', () => {
    expect(RELEASE_CHANNELS).toEqual(['stable', 'beta', 'nightly']);
  });

  it('has a customer-safe label for every channel', () => {
    for (const channel of RELEASE_CHANNELS) {
      expect(RELEASE_CHANNEL_LABELS[channel]).toMatch(/^[A-Z][a-z]+$/);
    }
    expect(RELEASE_CHANNEL_LABELS.beta).toBe('Beta');
  });

  it('rejects per-platform synonyms', () => {
    for (const synonym of [
      'alpha',
      'preview',
      'staging',
      'production',
      'dev',
      'prod',
      'dogfood',
      'bleeding-edge',
    ]) {
      expect(isReleaseChannel(synonym)).toBe(false);
    }
  });
});

describe('desktop feed mapping (macOS direct)', () => {
  it('maps updater feeds to canonical channels', () => {
    expect(releaseChannelForDesktopFeed('production')).toBe('stable');
    expect(releaseChannelForDesktopFeed('staging')).toBe('beta');
  });

  it('treats local dev shells as no published channel', () => {
    expect(releaseChannelForDesktopFeed('local')).toBeNull();
  });
});

describe('iOS provenance mapping', () => {
  it('derives channel from install provenance', () => {
    expect(releaseChannelForIosProvenance('app-store')).toBe('stable');
    expect(releaseChannelForIosProvenance('testflight')).toBe('beta');
    expect(releaseChannelForIosProvenance('development')).toBeNull();
  });
});

describe('channel switch policy', () => {
  it('allows an in-place selector only on macOS direct distribution', () => {
    expect(CHANNEL_SWITCH_POLICY['macos-direct']).toBe('selectable');
  });

  it('forbids a fake self-switch toggle on iOS', () => {
    expect(CHANNEL_SWITCH_POLICY['ios-app-store']).toBe('derived');
    expect(CHANNEL_SWITCH_POLICY['ios-testflight']).toBe('derived');
  });

  it('treats a future Mac App Store build as a Stable-only adapter', () => {
    expect(CHANNEL_SWITCH_POLICY['mac-app-store']).toBe('stable-only');
  });
});

describe('settings surface contract', () => {
  it('keeps the customer surface to release identity only', () => {
    expect(CUSTOMER_SETTINGS_FIELDS).toEqual([
      'version',
      'build',
      'update-status',
      'release-channel',
    ]);
  });

  it('keeps operational detail on the advanced surface', () => {
    for (const field of CUSTOMER_SETTINGS_FIELDS) {
      expect(ADVANCED_SETTINGS_FIELDS).toContain(field);
    }
    expect(ADVANCED_SETTINGS_FIELDS).toContain('build-freshness');
    expect(CUSTOMER_SETTINGS_FIELDS).not.toContain('build-freshness');
    expect(CUSTOMER_SETTINGS_FIELDS).not.toContain('source-revision');
  });
});
