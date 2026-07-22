import { describe, expect, it } from 'vitest';
import {
  assertConnectorProviderId,
  CONNECTOR_DB_STATUS_IDS,
  CONNECTOR_PROVIDER_IDS,
  CONNECTOR_PROVIDERS,
  CONNECTOR_REGISTRY,
  connectorProviderSchema,
  GOOGLE_CONNECTOR_PROVIDERS,
  GOOGLE_OAUTH_SCOPE,
  getConnectorDefinition,
  getConnectorDefinitions,
  getOAuthScopesForBundle,
  isConnectorProviderId,
} from '@/lib/connectors/registry';
import {
  connectorProviderEnum,
  connectorStatusEnum,
} from '@/lib/db/schema/enums';

describe('connector provider registry', () => {
  it('derives provider types from the Drizzle connector_provider enum', () => {
    const enumValues = [...connectorProviderEnum.enumValues].sort();
    const runtimeValues = [...CONNECTOR_PROVIDER_IDS].sort();
    expect(runtimeValues).toEqual(enumValues);
  });

  it('derives DB status ids from the Drizzle connector_status enum', () => {
    const enumValues = [...connectorStatusEnum.enumValues].sort();
    const runtimeValues = [...CONNECTOR_DB_STATUS_IDS].sort();
    expect(runtimeValues).toEqual(enumValues);
  });

  it('registers every enum provider in CONNECTOR_REGISTRY', () => {
    for (const providerId of connectorProviderEnum.enumValues) {
      expect(CONNECTOR_REGISTRY[providerId]?.id).toBe(providerId);
    }
  });

  it('registers the launch Google providers', () => {
    const definitions = getConnectorDefinitions();
    expect(definitions.map(definition => definition.id)).toEqual([
      CONNECTOR_PROVIDERS.gmail,
      CONNECTOR_PROVIDERS.google_calendar,
    ]);
  });

  it('returns definitions by id', () => {
    expect(getConnectorDefinition(CONNECTOR_PROVIDERS.gmail).label).toBe(
      'Gmail'
    );
    expect(
      getConnectorDefinition(CONNECTOR_PROVIDERS.google_calendar).iconKey
    ).toBe('calendar');
  });

  it('exposes oauth scopes, token handler, sync runner, and webhook key', () => {
    const gmail = getConnectorDefinition(CONNECTOR_PROVIDERS.gmail);
    expect(gmail.oauthScopes).toContain(GOOGLE_OAUTH_SCOPE.gmailReadonly);
    expect(gmail.tokenHandler).toBe('shared_token_vault');
    expect(gmail.syncRunner).toBe(CONNECTOR_PROVIDERS.gmail);
    expect(gmail.webhookHandler).toBeNull();

    const calendar = getConnectorDefinition(
      CONNECTOR_PROVIDERS.google_calendar
    );
    expect(calendar.oauthScopes).toEqual(
      expect.arrayContaining([
        GOOGLE_OAUTH_SCOPE.calendarEventsReadonly,
        GOOGLE_OAUTH_SCOPE.calendarEvents,
      ])
    );
    expect(calendar.syncRunner).toBe(CONNECTOR_PROVIDERS.google_calendar);
  });

  it('unions Google OAuth scopes for the combined authorize flow', () => {
    const scopes = getOAuthScopesForBundle('google');
    expect(scopes).toEqual([
      GOOGLE_OAUTH_SCOPE.gmailReadonly,
      GOOGLE_OAUTH_SCOPE.userinfoEmail,
      GOOGLE_OAUTH_SCOPE.calendarEventsReadonly,
      GOOGLE_OAUTH_SCOPE.calendarEvents,
    ]);
    // userinfo.email appears once even though both providers request it
    expect(
      scopes.filter(scope => scope === GOOGLE_OAUTH_SCOPE.userinfoEmail)
    ).toHaveLength(1);
  });

  it('groups Google OAuth providers', () => {
    expect(GOOGLE_CONNECTOR_PROVIDERS).toEqual([
      CONNECTOR_PROVIDERS.gmail,
      CONNECTOR_PROVIDERS.google_calendar,
    ]);
  });

  it('validates provider ids', () => {
    expect(isConnectorProviderId('gmail')).toBe(true);
    expect(isConnectorProviderId('spotify')).toBe(false);
    expect(() => assertConnectorProviderId('spotify')).toThrow(
      'Unknown connector provider'
    );
  });

  it('accepts only registered providers in zod schema', () => {
    expect(
      connectorProviderSchema.safeParse(CONNECTOR_PROVIDERS.gmail).success
    ).toBe(true);
    expect(connectorProviderSchema.safeParse('instagram').success).toBe(false);
  });

  it('keeps registry keys aligned with provider ids', () => {
    for (const providerId of Object.keys(CONNECTOR_REGISTRY)) {
      expect(
        CONNECTOR_REGISTRY[providerId as keyof typeof CONNECTOR_REGISTRY].id
      ).toBe(providerId);
    }
  });
});
