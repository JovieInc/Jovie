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
import {
  CONNECTOR_PROVIDER_IDS,
  type ConnectorDefinition,
  type ConnectorProviderId,
} from './types';

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
    description: 'Scan booking emails for tour confirmation signals.',
    iconKey: 'mail',
    oauthBundle: 'google',
    oauthScopes: [
      GOOGLE_OAUTH_SCOPE.gmailReadonly,
      GOOGLE_OAUTH_SCOPE.userinfoEmail,
    ],
    tokenHandler: 'shared_token_vault',
    syncRunner: CONNECTOR_PROVIDERS.gmail,
    webhookHandler: null,
    displayOrder: 1,
  },
  [CONNECTOR_PROVIDERS.google_calendar]: {
    id: CONNECTOR_PROVIDERS.google_calendar,
    label: 'Google Calendar',
    description: 'Read events to detect conflicts and write approved bookings.',
    iconKey: 'calendar',
    oauthBundle: 'google',
    oauthScopes: [
      GOOGLE_OAUTH_SCOPE.calendarEventsReadonly,
      GOOGLE_OAUTH_SCOPE.calendarEvents,
      GOOGLE_OAUTH_SCOPE.userinfoEmail,
    ],
    tokenHandler: 'shared_token_vault',
    syncRunner: CONNECTOR_PROVIDERS.google_calendar,
    webhookHandler: null,
    displayOrder: 2,
  },
} as const satisfies Record<ConnectorProviderId, ConnectorDefinition>;

/** Providers that share the Google OAuth authorize/callback/disconnect flow. */
export const GOOGLE_CONNECTOR_PROVIDERS = CONNECTOR_PROVIDER_IDS.filter(
  providerId => CONNECTOR_REGISTRY[providerId].oauthBundle === 'google'
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
