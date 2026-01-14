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

  await database.transaction(async tx => {
    await tx.execute(drizzleSql`SELECT 'transaction_test' as test`);
  });

  return true;
}
