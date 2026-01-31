import { sql as drizzleSql } from 'drizzle-orm';
import type { DbType } from '../index';

type LogDbInfo = (
  context: string,
  message: string,
  metadata?: Record<string, unknown>
) => void;

export type PoolState = {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

export async function checkPoolHealth(
  database: DbType,
  poolState: PoolState | null,
  logDbInfo: LogDbInfo
): Promise<boolean> {
  if (poolState) {
    logDbInfo('healthCheck', 'Connection pool stats', poolState);
  }

  // The neon-http driver does not support transactions
  // Execute a simple query instead to verify connectivity
  await database.execute(drizzleSql`SELECT 'health_check' as test`);

  return true;
}
