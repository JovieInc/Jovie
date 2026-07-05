/**
 * Connector types — single source of truth for provider and status identifiers.
 *
 * Runtime constants live in `registry.ts`; this module holds the derived types
 * so server and client code can share them without importing the manifest.
 */

/** Provider ids persisted in `connector_accounts.provider` / `external_objects.provider`. */
export const CONNECTOR_PROVIDER_IDS = ['gmail', 'google_calendar'] as const;

export type ConnectorProviderId = (typeof CONNECTOR_PROVIDER_IDS)[number];

/** Status values persisted in `connector_accounts.status`. */
export const CONNECTOR_DB_STATUS_IDS = [
  'connected',
  'needs_reauth',
  'error',
  'disabled',
] as const;

export type ConnectorDbStatus = (typeof CONNECTOR_DB_STATUS_IDS)[number];

/**
 * UI-facing connector status. Includes derived states that are not stored in DB
 * (`not_connected` when no row exists, `syncing` while a sync is in flight).
 */
export type ConnectorStatus = ConnectorDbStatus | 'not_connected' | 'syncing';

export type ConnectorIconKey = 'mail' | 'calendar';

export type ConnectorOAuthBundle = 'google';

export interface ConnectorDefinition {
  readonly id: ConnectorProviderId;
  readonly label: string;
  readonly description: string;
  readonly iconKey: ConnectorIconKey;
  /** OAuth providers that share a single authorize/callback flow. */
  readonly oauthBundle: ConnectorOAuthBundle;
  readonly displayOrder: number;
}
