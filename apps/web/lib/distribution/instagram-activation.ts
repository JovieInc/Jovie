import { getProfileUrl } from '@/constants/domains';
import { buildUTMUrlString, slugify } from '@/lib/utm';
import { UTM_PRESET_MAP } from '@/lib/utm/presets';

export const INSTAGRAM_DISTRIBUTION_PLATFORM = 'instagram' as const;
export const INSTAGRAM_EDIT_PROFILE_URL =
  'https://www.instagram.com/accounts/edit/';
export const BIO_LINK_ACTIVATION_WINDOW_DAYS = 7;

export const CREATOR_DISTRIBUTION_EVENT_TYPES = [
  'step_viewed',
  'link_copied',
  'platform_opened',
  'skipped',
  'activated',
] as const;

const INSTAGRAM_REFERRER_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'l.instagram.com',
]);

export type CreatorDistributionPlatform =
  typeof INSTAGRAM_DISTRIBUTION_PLATFORM;

export type CreatorDistributionEventType =
  (typeof CREATOR_DISTRIBUTION_EVENT_TYPES)[number];

export type BioLinkActivationStatus = 'pending' | 'activated' | 'expired';

export interface DistributionEventPayload {
  readonly eventType: CreatorDistributionEventType;
  readonly metadata?: Record<string, unknown>;
  readonly platform: CreatorDistributionPlatform;
  readonly profileId: string;
}

export interface BioLinkActivation {
  readonly activatedAt: string | null;
  readonly copiedAt: string | null;
  readonly openedAt: string | null;
  readonly platform: CreatorDistributionPlatform;
  readonly status: BioLinkActivationStatus;
  readonly windowEndsAt: string | null;
}

interface ActivationSourceParams {
  readonly referrer?: string | null;
  readonly utmParams?: {
    readonly source?: string | null;
  } | null;
}

type DateInput = Date | string | null | undefined;

function coerceDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseHostname(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getCampaignSeed(profileUrl: string): string {
  try {
    const url = new URL(profileUrl);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const handle = pathSegments.at(-1);
    if (handle) {
      return slugify(handle);
    }
  } catch {
    // Fall back to a stable campaign name when URL parsing fails.
  }

  return 'profile';
}

export function buildInstagramBioLink(profileUrl: string): string {
  const preset = UTM_PRESET_MAP['instagram-bio'];
  const campaignSeed = getCampaignSeed(profileUrl);

  return buildUTMUrlString({
    context: { releaseSlug: campaignSeed },
    params: preset.params,
    url: profileUrl,
  });
}

export function buildInstagramBioLinkFromHandle(handle: string): string {
  return buildInstagramBioLink(getProfileUrl(handle));
}

export function buildDistributionDedupeKey(
  profileId: string,
  platform: CreatorDistributionPlatform,
  eventType: CreatorDistributionEventType
): string {
  return `${platform}:${eventType}:${profileId}`;
}

export function getBioLinkActivationWindowEnd(
  onboardingCompletedAt: DateInput
): Date | null {
  const onboardingDate = coerceDate(onboardingCompletedAt);
  if (!onboardingDate) {
    return null;
  }

  return new Date(
    onboardingDate.getTime() +
      BIO_LINK_ACTIVATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
}

export function resolveBioLinkActivationStatus({
  activatedAt,
  now = new Date(),
  windowEndsAt,
}: {
  readonly activatedAt: Date | string | null | undefined;
  readonly now?: Date;
  readonly windowEndsAt: Date | string | null | undefined;
}): BioLinkActivationStatus {
  if (coerceDate(activatedAt)) {
    return 'activated';
  }

  const activationWindowEnd = coerceDate(windowEndsAt);
  if (!activationWindowEnd) {
    return 'pending';
  }

  return now.getTime() > activationWindowEnd.getTime() ? 'expired' : 'pending';
}

export function isInstagramReferrer(
  referrer: string | null | undefined
): boolean {
  const hostname = parseHostname(referrer);
  return hostname !== null && INSTAGRAM_REFERRER_HOSTS.has(hostname);
}

export function getInstagramReferrerHost(
  referrer: string | null | undefined
): string | null {
  const hostname = parseHostname(referrer);
  return hostname !== null && INSTAGRAM_REFERRER_HOSTS.has(hostname)
    ? hostname
    : null;
}

export function isInstagramActivationSource({
  referrer,
  utmParams,
}: ActivationSourceParams): boolean {
  const utmSource = utmParams?.source?.trim().toLowerCase();
  return (
    utmSource === INSTAGRAM_DISTRIBUTION_PLATFORM ||
    isInstagramReferrer(referrer)
  );
}

export async function postDistributionEvent(
  payload: DistributionEventPayload
): Promise<boolean> {
  // This helper relies on a same-origin relative URL and keepalive semantics,
  // so accidental server-side calls should no-op instead of throwing.
  if (globalThis.window === undefined) {
    return false;
  }

  try {
    const response = await fetch('/api/onboarding/distribution-event', {
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      method: 'POST',
    });

    return response.ok;
  } catch {
    return false;
  }
}
