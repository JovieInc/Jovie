import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type FanNotificationPreferences,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { trackSubscribeError } from '@/lib/notifications/analytics';
import {
  buildSubscribeNotFoundError,
  type NotificationSubscribeDomainResponse,
} from '@/lib/notifications/response';
import type {
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Matches C0 control characters (U+0000-U+001F) and DEL (U+007F) using Unicode property escapes */
const CONTROL_CHAR_REGEX = /\p{Cc}/gu;

const getHeader = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? null;

const _getForwardedIp = (headers?: Headers) =>
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || null;

const _sanitizeCity = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replaceAll(CONTROL_CHAR_REGEX, '')
    .replaceAll(/\s+/g, ' ');
  return cleaned || null;
};

const _sanitizeCountryCode = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 2).toUpperCase();
  const normalized = trimmed.replaceAll(/[^A-Z]/g, '');
  return normalized.length === 2 ? normalized : null;
};

interface ArtistProfileResult {
  profile: {
    id: string;
    displayName: string | null;
    username: string | null;
    creatorIsPro: boolean;
    creatorClerkId: string | null;
    settings: Record<string, unknown> | null;
  };
  dynamicEnabled: boolean;
}

/**
 * Fetches artist profile and computes dynamic engagement status.
 */
async function _fetchArtistProfile(
  artist_id: string,
  source: string | undefined
): Promise<ArtistProfileResult | NotificationSubscribeDomainResponse> {
  const [artistProfile] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      settings: creatorProfiles.settings,
      creatorIsPro: users.isPro,
      creatorClerkId: users.clerkId,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, artist_id))
    .limit(1);

  if (!artistProfile) {
    await trackSubscribeError({
      artist_id,
      error_type: 'artist_not_found',
      source,
    });
    return buildSubscribeNotFoundError();
  }

  const creatorIsPro = !!artistProfile.creatorIsPro;
  const creatorClerkId =
    typeof artistProfile.creatorClerkId === 'string'
      ? artistProfile.creatorClerkId
      : null;

  const dynamicEnabled = creatorIsPro;

  return {
    profile: {
      id: artistProfile.id,
      displayName: artistProfile.displayName,
      username: artistProfile.username,
      creatorIsPro,
      creatorClerkId,
      settings: artistProfile.settings,
    },
    dynamicEnabled,
  };
}

function _isArtistProfileResult(
  result: ArtistProfileResult | NotificationSubscribeDomainResponse
): result is ArtistProfileResult {
  return 'profile' in result && 'dynamicEnabled' in result;
}

function _isDoubleOptInEnabled(
  settings: Record<string, unknown> | null
): boolean {
  if (!settings) return true;
  const value = settings.require_double_opt_in;
  if (typeof value === 'boolean') return value;
  return true; // default: on
}

function _buildSubscriptionClauses(
  normalizedEmail: string | null,
  normalizedPhone: string | null
): Array<ReturnType<typeof and>> {
  const clauses: Array<ReturnType<typeof and>> = [];

  if (normalizedEmail) {
    clauses.push(
      and(
        eq(notificationSubscriptions.channel, 'email'),
        eq(notificationSubscriptions.email, normalizedEmail)
      )
    );
  }

  if (normalizedPhone) {
    clauses.push(
      and(
        eq(notificationSubscriptions.channel, 'sms'),
        eq(notificationSubscriptions.phone, normalizedPhone)
      )
    );
  }

  return clauses;
}

/**
 * Merge subscription rows into channel states, contact details, and preferences.
 */
function _mergeSubscriptionRows(
  rows: Array<{
    channel: string;
    email: string | null;
    phone: string | null;
    preferences: FanNotificationPreferences | null;
  }>
) {
  const channels: NotificationSubscriptionState = { email: false, sms: false };
  const details: NotificationContactValues = {};
  let mergedPrefs: FanNotificationPreferences | undefined;

  for (const row of rows) {
    if (row.channel === 'email' && row.email) {
      channels.email = true;
      details.email = row.email;
    }

    if (row.channel === 'sms' && row.phone) {
      channels.sms = true;
      details.sms = row.phone;
    }

    if (!mergedPrefs && row.preferences) {
      mergedPrefs = row.preferences;
    }
  }

  return { channels, details, mergedPrefs };
}
