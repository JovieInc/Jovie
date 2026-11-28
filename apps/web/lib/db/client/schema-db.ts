import type { Client, Pool, PoolClient } from '@neondatabase/serverless';
import type { Logger } from 'drizzle-orm/logger';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../schema';
import type { DbType } from './types';

/** Bind the canonical schema to an existing connection without creating a pool. */
export function createSchemaDb(
  client: Client | Pool | PoolClient,
  logger: boolean | Logger = false
): DbType {
  return drizzle(client, { schema, logger });
}
