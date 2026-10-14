import { getConnectorDefinitions } from './registry';
import type {
  ConnectorAvailability,
  ConnectorCapability,
  ConnectorDefinition,
  ConnectorProviderId,
  ConnectorStatus,
} from './types';

/** Access is evidence of permissions, not evidence that an operation succeeded. */
export function getGrantedConnectorCapabilities(
  definition: ConnectorDefinition,
  status: ConnectorStatus,
  scopes: readonly string[]
): readonly ConnectorCapability[] {
  if (status !== 'connected' && status !== 'syncing') return [];
  return definition.capabilities.filter(
    capability =>
      capability.availability === 'available' &&
      capability.requiredScopes.every(scope => scopes.includes(scope))
  );
}

/** Public copy is a projection of implemented operations, never a provider wishlist. */
export function getAdvertisedConnectorIntegrations(
  availability: Readonly<Record<ConnectorProviderId, ConnectorAvailability>>,
  platform: ConnectorDefinition['platforms'][number] = 'web'
) {
  return getConnectorDefinitions().flatMap(definition => {
    if (
      !availability[definition.id].available ||
      !definition.platforms.includes(platform)
    ) {
      return [];
    }
    const capabilities = definition.capabilities.filter(
      capability => capability.availability === 'available'
    );
    return capabilities.length > 0
      ? [{ id: definition.id, label: definition.label, capabilities }]
      : [];
  });
}
