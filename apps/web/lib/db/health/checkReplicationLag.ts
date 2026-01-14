import { sql as drizzleSql } from 'drizzle-orm';
import type { DbType } from '../index';

type LogDbInfo = (
  context: string,
  message: string,
  metadata?: Record<string, unknown>
) => void;

export async function checkReplicationLag(
  database: DbType,
  tableName: string,
  logDbInfo: LogDbInfo
): Promise<{ schemaAccess: boolean }> {
  let schemaAccess = false;

  try {
    await database.execute(
      drizzleSql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ${tableName}) as table_exists`
    );
    schemaAccess = true;
  } catch {
    logDbInfo(
      'healthCheck',
      'Schema access test failed (tables may not exist)',
      {}
    );
  }

  try {
    await database.execute(
      drizzleSql`SELECT pg_last_xact_replay_timestamp() as replay_ts`
    );
  } catch {
    logDbInfo(
      'healthCheck',
      'Replication lag check skipped (not supported)',
      {}
    );
  }

  return { schemaAccess };
}
