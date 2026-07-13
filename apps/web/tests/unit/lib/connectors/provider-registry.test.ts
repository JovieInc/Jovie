import { describe, expect, it } from 'vitest';
import {
  assertConnectorProviderId,
  CONNECTOR_PROVIDERS,
  CONNECTOR_REGISTRY,
  connectorProviderSchema,
  GOOGLE_CONNECTOR_PROVIDERS,
  getConnectorDefinition,
  getConnectorDefinitions,
  isConnectorProviderId,
} from '@/lib/connectors/registry';

describe('connector provider registry', () => {
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
