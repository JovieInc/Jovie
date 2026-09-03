/**
 * YouTube Library — connected-account probe (JOV-5726)
 *
 * Answers one question for shell pages: does this user have a connected
 * YouTube account for the profile? Exists so `(shell)` page entrypoints can
 * stay free of `@/lib/db` / `drizzle-orm` imports
 * (see apps/web/tests/unit/app/shell-route-boundary-guard.test.ts) while the
 * YouTube projection on the Library page keeps its fail-soft behavior.
 */

import { and, eq } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';

/**
 * Fail-soft probe: resolves `false` on error (captured via `captureError`)
 * so a connection-table hiccup can never take down the Library page load.
 */
export async function hasConnectedYouTubeAccount({
  userId,
  creatorProfileId,
  route,
}: {
  userId: string;
  creatorProfileId: string;
  route?: string;
}): Promise<boolean> {
  try {
    const row = await db
      .select({ id: connectorAccounts.id })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, userId),
          eq(connectorAccounts.creatorProfileId, creatorProfileId),
          eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
          eq(connectorAccounts.status, 'connected')
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null);
    return Boolean(row);
  } catch (error) {
    void captureError('YouTube Library projection failed', error, {
      route: route ?? 'unknown',
    });
    return false;
  }
}
