import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import type { ConnectorDbStatus, ConnectorProviderId } from './types';

export function asConnectorProviderSql(provider: ConnectorProviderId) {
  return drizzleSql.raw(`'${provider}'::connector_provider`);
}

export function asConnectorStatusSql(status: ConnectorDbStatus) {
  return drizzleSql.raw(`'${status}'::connector_status`);
}
