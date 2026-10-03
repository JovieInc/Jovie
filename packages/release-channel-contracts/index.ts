/**
 * Canonical release-channel contract (JOV-7535).
 *
 * One product concept — Release channel — shared by web, macOS, and iOS.
 * Platform mechanics (Electron updater feeds, TestFlight provenance, local
 * dev shells) map onto these canonical channels; surfaces must not invent
 * per-platform synonyms ("alpha", "preview", "dev ring", "staging build")
 * unless they map explicitly here. Canon: canon/RELEASE_CHANNELS.md.
 */

export const RELEASE_CHANNELS = ['stable', 'beta', 'nightly'] as const;

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

/** Customer-safe labels. "Beta" is the dogfood rail; never say "staging". */
export const RELEASE_CHANNEL_LABELS: Record<ReleaseChannel, string> = {
  stable: 'Stable',
  beta: 'Beta',
  nightly: 'Nightly',
} as const;

export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return (
    typeof value === 'string' &&
    (RELEASE_CHANNELS as readonly string[]).includes(value)
  );
}

/**
 * macOS direct distribution: the Electron app's updater feed environments
 * (`apps/desktop` `DesktopReleaseChannel` / `DesktopAppEnv`). `production`
 * publishes the Stable feed, `staging` publishes the Beta/Dogfood feed.
 * `local` is a dev shell on no published rail — it has no channel.
 */
export type DesktopFeedChannel = 'production' | 'staging' | 'local';

export function releaseChannelForDesktopFeed(
  feed: DesktopFeedChannel
): ReleaseChannel | null {
  switch (feed) {
    case 'production':
      return 'stable';
    case 'staging':
      return 'beta';
    case 'local':
      return null;
  }
}

/**
 * iOS: the channel is derived from install provenance, never toggled in-app.
 * An App Store build cannot self-switch into TestFlight; Beta enrollment
 * deep-links to the canonical TestFlight flow. Debug/development builds sit
 * on no published rail. Missing or unrecognized provenance is unknown, never
 * evidence of a published channel or a development build.
 */
export type IosDistributionProvenance =
  | 'app-store'
  | 'testflight'
  | 'development'
  | 'unknown';

export function releaseChannelForIosProvenance(
  provenance: IosDistributionProvenance
): ReleaseChannel | null {
  switch (provenance) {
    case 'app-store':
      return 'stable';
    case 'testflight':
      return 'beta';
    case 'development':
    case 'unknown':
      return null;
  }
}

/**
 * Whether a Settings surface may offer a channel selector.
 * - `selectable`: switching retargets the canonical update feed in place
 *   (macOS direct) — never a second install or state reset.
 * - `derived`: read-only, derived from install provenance (iOS). Offering a
 *   toggle here is a contract violation.
 * - `stable-only`: future Mac App Store adapter distributes Stable only.
 */
export type ChannelSwitchPolicy = 'selectable' | 'derived' | 'stable-only';

export type DistributionAdapter =
  | 'macos-direct'
  | 'ios-app-store'
  | 'ios-testflight'
  | 'mac-app-store';

export const CHANNEL_SWITCH_POLICY: Record<
  DistributionAdapter,
  ChannelSwitchPolicy
> = {
  'macos-direct': 'selectable',
  'ios-app-store': 'derived',
  'ios-testflight': 'derived',
  'mac-app-store': 'stable-only',
} as const;

/**
 * What Settings may show. Normal customers get release identity only
 * (version/build, actionable update status, channel for support). Build
 * lineage, freshness receipts, feed plumbing, and ops state stay in Ovi
 * Shipping — the `advanced` surface is founder/admin/developer only.
 */
export type ReleaseChannelSurface = 'customer' | 'advanced';

export const CUSTOMER_SETTINGS_FIELDS = [
  'version',
  'build',
  'update-status',
  'release-channel',
] as const;

export const ADVANCED_SETTINGS_FIELDS = [
  ...CUSTOMER_SETTINGS_FIELDS,
  'build-identity',
  'build-freshness',
  'last-update-check',
  'last-successful-update',
] as const;
