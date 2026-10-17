import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import type { DbOrTransaction } from './client/types';

/** Narrow definer helper checks and locks only the authenticated financial owner. */
export async function lockActiveRoyaltyOwner(
  tx: DbOrTransaction
): Promise<boolean> {
  const [row] = await tx
    .select({
      active: drizzleSql<boolean>`lock_active_royalty_owner()`,
    })
    .from(drizzleSql`(values (1)) as royalty_session (unused)`)
    .limit(1);
  return row?.active === true;
}
