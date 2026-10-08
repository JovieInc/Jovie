/**
 * Connector Provider Registry — single source of truth for connector manifests.
 *
 * Adding a provider:
 * 1. Add the value to `connectorProviderEnum` in `lib/db/schema/enums.ts` (+ migration).
 * 2. Append the id to `CONNECTOR_PROVIDER_IDS` in `types.ts` (client-safe runtime list).
 * 3. Add a full `ConnectorDefinition` entry below (scopes, handlers, UI metadata).
 * 4. Wire OAuth/sync modules referenced by the definition.
 *
 * Provider *types* come from the Drizzle enum (`ConnectorProviderId` in enums.ts).
 * Do not hand-maintain a second union in UI components — import from this module.
 */

import { z } from 'zod';
import { SPOTIFY_OAUTH_SCOPES } from './spotify/scopes';
import {
  CONNECTOR_PROVIDER_IDS,
  type ConnectorDefinition,
  type ConnectorProviderId,
} from './types';
import { YOUTUBE_OAUTH_SCOPES } from './youtube/scopes';

export {
  CONNECTOR_DB_STATUS_IDS,
  CONNECTOR_PROVIDER_IDS,
  type ConnectorDbStatus,
  type ConnectorDefinition,
  type ConnectorIconKey,
  type ConnectorOAuthBundle,
  type ConnectorProviderId,
  type ConnectorStatus,
  type ConnectorTokenHandler,
} from './types';

/** Stable id map — prefer these over inline string literals at call sites. */
export const CONNECTOR_PROVIDERS = {
  gmail: 'gmail',
  google_calendar: 'google_calendar',
  spotify: 'spotify',
  youtube: 'youtube',
} as const satisfies Record<string, ConnectorProviderId>;

/** Google OAuth scope constants — referenced by registry entries and authorize. */
export const GOOGLE_OAUTH_SCOPE = {
  calendarEventsReadonly:
    'https://www.googleapis.com/auth/calendar.events.readonly',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  userinfoEmail: 'https://www.googleapis.com/auth/userinfo.email',
} as const;

export const CONNECTOR_REGISTRY = {
  [CONNECTOR_PROVIDERS.gmail]: {
    id: CONNECTOR_PROVIDERS.gmail,
    label: 'Gmail',
    description: 'Find confirmed bookings in your email.',
    iconKey: 'mail',
    oauthBundle: 'google',
    oauthScopes: [
      GOOGLE_OAUTH_SCOPE.gmailReadonly,
      GOOGLE_OAUTH_SCOPE.userinfoEmail,
    ],
    oauthScopeLabels: ['Read Booking Emails', 'View Account Email'],
    tokenHandler: 'shared_token_vault',
    syncRunner: CONNECTOR_PROVIDERS.gmail,
    webhookHandler: null,
    displayOrder: 1,
    accountScope: 'user',
    platforms: ['web', 'mac'],
    capabilities: [
      {
        id: 'booking_emails.read',
        label: 'Read booking emails',
        mode: 'read',
        requiredScopes: [GOOGLE_OAUTH_SCOPE.gmailReadonly],
        requiresApproval: false,
        availability: 'available',
      },
    ],
  },
  [CONNECTOR_PROVIDERS.google_calendar]: {
    id: CONNECTOR_PROVIDERS.google_calendar,
    label: 'Google Calendar',
    description: 'Check scheduling conflicts and add approved bookings.',
    iconKey: 'calendar',
    oauthBundle: 'google',
    oauthScopes: [
      GOOGLE_OAUTH_SCOPE.calendarEventsReadonly,
      GOOGLE_OAUTH_SCOPE.calendarEvents,
      GOOGLE_OAUTH_SCOPE.userinfoEmail,
    ],
    oauthScopeLabels: [
      'Read Calendar Events',
      'Manage Approved Events',
      'View Account Email',
    ],
    tokenHandler: 'shared_token_vault',
    syncRunner: CONNECTOR_PROVIDERS.google_calendar,
    webhookHandler: null,
    displayOrder: 2,
    accountScope: 'user',
    platforms: ['web', 'mac'],
    capabilities: [
      {
        id: 'calendar_events.read',
        label: 'Read calendar events',
        mode: 'read',
        requiredScopes: [GOOGLE_OAUTH_SCOPE.calendarEventsReadonly],
        requiresApproval: false,
        availability: 'available',
      },
      {
        id: 'calendar_events.write',
        label: 'Create approved bookings',
        mode: 'write',
        requiredScopes: [GOOGLE_OAUTH_SCOPE.calendarEvents],
        requiresApproval: true,
        availability: 'available',
      },
    ],
  },
  [CONNECTOR_PROVIDERS.spotify]: {
    id: CONNECTOR_PROVIDERS.spotify,
    label: 'Spotify',
    description: 'Read playlists and publish playlists you approve.',
    iconKey: 'spotify',
    oauthBundle: 'spotify',
    oauthScopes: [...SPOTIFY_OAUTH_SCOPES],
    oauthScopeLabels: [
      'View Account Email',
      'View Account Details',
      'Manage Public Playlists',
      'Read Private Playlists',
      'Upload Playlist Covers',
      'Manage Private Playlists',
    ],
    tokenHandler: 'shared_token_vault',
    syncRunner: null,
    webhookHandler: null,
    displayOrder: 3,
    accountScope: 'user',
    platforms: ['web', 'mac'],
    capabilities: [
      {
        id: 'playlists.read',
        label: 'Read private playlists',
        mode: 'read',
        requiredScopes: ['playlist-read-private'],
        requiresApproval: false,
        availability: 'available',
      },
      {
        id: 'playlists.write',
        label: 'Publish approved playlists',
        mode: 'write',
        requiredScopes: [
          'playlist-modify-public',
          'playlist-modify-private',
          'ugc-image-upload',
        ],
        requiresApproval: true,
        availability: 'available',
      },
    ],
  },
  [CONNECTOR_PROVIDERS.youtube]: {
    id: CONNECTOR_PROVIDERS.youtube,
    label: 'YouTube',
    description:
      'Import videos into Work, apply thumbnail changes you approve, and post approved comment replies.',
    iconKey: 'youtube',
    oauthBundle: 'youtube',
    oauthScopes: YOUTUBE_OAUTH_SCOPES,
    oauthScopeLabels: [
      'Read Channel Data',
      'Manage Videos',
      'View Channel Analytics',
      'Post Approved Replies',
    ],
    tokenHandler: 'shared_token_vault',
    syncRunner: CONNECTOR_PROVIDERS.youtube,
    webhookHandler: null,
    displayOrder: 4,
    accountScope: 'identity',
    platforms: ['web', 'mac'],
    capabilities: [
      {
        id: 'channel_videos.read',
        label: 'Import channel videos',
        mode: 'read',
        requiredScopes: [YOUTUBE_OAUTH_SCOPES[0]],
        requiresApproval: false,
        availability: 'available',
      },
      {
        id: 'channel_analytics.read',
        label: 'Read channel analytics',
        mode: 'read',
        requiredScopes: [YOUTUBE_OAUTH_SCOPES[2]],
        requiresApproval: false,
        availability: 'available',
      },
      {
        id: 'video_thumbnails.write',
        label: 'Apply approved thumbnails',
        mode: 'write',
        requiredScopes: [YOUTUBE_OAUTH_SCOPES[1]],
        requiresApproval: true,
        availability: 'available',
      },
      {
        id: 'comment_replies.write',
        label: 'Post approved replies',
        mode: 'write',
        requiredScopes: [YOUTUBE_OAUTH_SCOPES[3]],
        requiresApproval: true,
        availability: 'available',
      },
    ],
  },
} as const satisfies Record<ConnectorProviderId, ConnectorDefinition>;

/** Providers that share the Google OAuth authorize/callback/disconnect flow. */
export const GOOGLE_CONNECTOR_PROVIDERS = CONNECTOR_PROVIDER_IDS.filter(
  providerId => CONNECTOR_REGISTRY[providerId].oauthBundle === 'google'
) as ConnectorProviderId[];

export const YOUTUBE_CONNECTOR_PROVIDERS = CONNECTOR_PROVIDER_IDS.filter(
  providerId => CONNECTOR_REGISTRY[providerId].oauthBundle === 'youtube'
) as ConnectorProviderId[];

export const connectorProviderSchema = z.enum(CONNECTOR_PROVIDER_IDS);

export function getConnectorDefinitions(): ConnectorDefinition[] {
  return CONNECTOR_PROVIDER_IDS.map(
    providerId => CONNECTOR_REGISTRY[providerId]
  ).sort((left, right) => left.displayOrder - right.displayOrder);
}

export function getConnectorDefinition(
  providerId: ConnectorProviderId
): ConnectorDefinition {
  return CONNECTOR_REGISTRY[providerId];
}

/**
 * Union of OAuth scopes for all providers in a bundle (deduped, stable order).
 * Used by the combined Google authorize consent screen.
 */
export function getOAuthScopesForBundle(
  bundle: ConnectorDefinition['oauthBundle']
): string[] {
  const seen = new Set<string>();
  const scopes: string[] = [];

  for (const providerId of CONNECTOR_PROVIDER_IDS) {
    const definition = CONNECTOR_REGISTRY[providerId];
    if (definition.oauthBundle !== bundle) continue;
    for (const scope of definition.oauthScopes) {
      if (seen.has(scope)) continue;
      seen.add(scope);
      scopes.push(scope);
    }
  }

  return scopes;
}

export function isConnectorProviderId(
  value: string
): value is ConnectorProviderId {
  return (CONNECTOR_PROVIDER_IDS as readonly string[]).includes(value);
}

export function assertConnectorProviderId(value: string): ConnectorProviderId {
  if (!isConnectorProviderId(value)) {
    throw new Error(`Unknown connector provider: ${value}`);
  }

  return value;
}
