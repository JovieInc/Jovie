/**
 * Connector Provider Registry — single source of truth
 *
 * Every connector definition lives here. Adding a provider means:
 * 1. Extend CONNECTOR_PROVIDER_IDS in types.ts (and the DB enum via migration).
 * 2. Add an entry to CONNECTOR_REGISTRY below.
 * 3. Wire OAuth/sync/workflow handlers for the new provider.
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
} from './types';

/** Stable id map — prefer these over inline string literals at call sites. */
export const CONNECTOR_PROVIDERS = {
  gmail: 'gmail',
  google_calendar: 'google_calendar',
} as const satisfies Record<string, ConnectorProviderId>;

export const CONNECTOR_REGISTRY = {
  [CONNECTOR_PROVIDERS.gmail]: {
    id: CONNECTOR_PROVIDERS.gmail,
    label: 'Gmail',
    description: 'Scan booking emails for tour confirmation signals.',
    iconKey: 'mail',
    oauthBundle: 'google',
    displayOrder: 1,
  },
  [CONNECTOR_PROVIDERS.google_calendar]: {
    id: CONNECTOR_PROVIDERS.google_calendar,
    label: 'Google Calendar',
    description: 'Read events to detect conflicts and write approved bookings.',
    iconKey: 'calendar',
    oauthBundle: 'google',
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
