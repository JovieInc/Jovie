import { sql as drizzleSql } from 'drizzle-orm';
import type { DbType } from '../index';

export async function checkQueryPerformance(
  database: DbType
): Promise<boolean> {
  await database.execute(drizzleSql`SELECT NOW() as current_time`);
  return true;
}
