/**
 * Connector types — client-safe contracts for provider ids and UI metadata.
 *
 * Provider/status *types* are derived from the Drizzle Postgres enums in
 * `lib/db/schema/enums.ts` (single source of truth). Runtime id arrays live
 * here so `'use client'` modules can import them without pulling Drizzle into
 * the browser bundle. `provider-registry.test.ts` fails if the runtime arrays
 * drift from `connectorProviderEnum.enumValues` / `connectorStatusEnum.enumValues`.
 *
 * Runtime definitions (scopes, handlers, UI copy) live in `registry.ts`.
 */

import type {
  ConnectorDbStatus as EnumConnectorDbStatus,
  ConnectorProviderId as EnumConnectorProviderId,
} from '@/lib/db/schema/enums';

export type ConnectorProviderId = EnumConnectorProviderId;
export type ConnectorDbStatus = EnumConnectorDbStatus;

/**
 * Runtime provider ids for client + zod validation.
 * Must match `connectorProviderEnum.enumValues` (order may differ for display).
 */
export const CONNECTOR_PROVIDER_IDS = [
  'gmail',
  'google_calendar',
] as const satisfies readonly ConnectorProviderId[];

/**
 * Runtime DB status ids for client + validation helpers.
 * Must match `connectorStatusEnum.enumValues`.
 */
export const CONNECTOR_DB_STATUS_IDS = [
  'connected',
  'needs_reauth',
  'error',
  'disabled',
] as const satisfies readonly ConnectorDbStatus[];

/**
 * UI-facing connector status. Includes derived states that are not stored in DB
 * (`not_connected` when no row exists, `syncing` while a sync is in flight).
 */
export type ConnectorStatus = ConnectorDbStatus | 'not_connected' | 'syncing';

export type ConnectorIconKey = 'mail' | 'calendar';

export type ConnectorOAuthBundle = 'google';

/** Shared vault used by all OAuth connectors today (`lib/connectors/token-vault.ts`). */
export type ConnectorTokenHandler = 'shared_token_vault';

/**
 * Canonical connector manifest entry.
 *
 * Adding a provider = migration for the Postgres enum value + one registry entry.
 * OAuth scopes, token path, sync runner, and webhook key stay on the definition
 * so call sites do not hardcode provider-specific strings.
 */
export interface ConnectorDefinition {
  /** Provider slug — must equal a `connector_provider` enum value. */
  readonly id: ConnectorProviderId;
  readonly label: string;
  readonly description: string;
  readonly iconKey: ConnectorIconKey;
  /** OAuth providers that share a single authorize/callback flow. */
  readonly oauthBundle: ConnectorOAuthBundle;
  /** Scopes requested when connecting this provider (unioned per oauthBundle). */
  readonly oauthScopes: readonly string[];
  /** Token storage/refresh strategy. */
  readonly tokenHandler: ConnectorTokenHandler;
  /**
   * Enrichment/sync pipeline key (see `lib/connectors/enrichment/registry.ts`).
   * Null when the provider has no background sync yet.
   */
  readonly syncRunner: ConnectorProviderId | null;
  /**
   * Inbound webhook handler key. Null for OAuth-polled providers with no push.
   */
  readonly webhookHandler: string | null;
  readonly displayOrder: number;
}
