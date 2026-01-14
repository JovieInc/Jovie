import { sql as drizzleSql } from 'drizzle-orm';
import type { DbType } from '../index';

export async function checkDatabaseConnection(
  database: DbType
): Promise<boolean> {
  await database.execute(drizzleSql`SELECT 1 as health_check`);
  return true;
}
