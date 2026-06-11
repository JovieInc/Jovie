import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import {
  CONNECTOR_DB_STATUS_IDS,
  CONNECTOR_PROVIDER_IDS,
  type ConnectorDbStatus,
  type ConnectorProviderId,
} from './types';

function assertKnownConnectorValue(
  value: string,
  allowed: readonly string[],
  label: string
) {
  if (!allowed.includes(value)) {
    throw new TypeError(`Unsupported connector ${label}: ${value}`);
  }
}

export function asConnectorProviderSql(provider: ConnectorProviderId) {
  assertKnownConnectorValue(provider, CONNECTOR_PROVIDER_IDS, 'provider');
  return drizzleSql`${provider}::connector_provider`;
}

export function asConnectorStatusSql(status: ConnectorDbStatus) {
  assertKnownConnectorValue(status, CONNECTOR_DB_STATUS_IDS, 'status');
  return drizzleSql`${status}::connector_status`;
}
