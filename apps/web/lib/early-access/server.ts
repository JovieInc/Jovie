import 'server-only';

import { eq } from 'drizzle-orm';
import type { JovieUser } from '@/lib/auth/jovie-user';
import { db } from '@/lib/db';
import { dogfooders } from '@/lib/db/schema/dogfooders';
import { createRateLimiter } from '@/lib/rate-limit';
import { EARLY_ACCESS_TOGGLE_LIMIT_PER_DAY } from './constants';

export const earlyAccessToggleLimiter = createRateLimiter(
  {
    name: 'Early Access Toggle',
    limit: EARLY_ACCESS_TOGGLE_LIMIT_PER_DAY,
    window: '1 d',
    prefix: 'early_access_toggle',
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'authenticated',
    requireRedis: true,
  },
  { requireRedis: true }
);

function hasEarlyAccessConsent(consent: {
  grantedAt: string | null;
  revokedAt: string | null;
}): boolean {
  return consent.grantedAt !== null && consent.revokedAt === null;
}

export async function isEarlyAccess(
  user: Pick<JovieUser, 'id'>
): Promise<boolean> {
  const [row] = await db
    .select({
      products: dogfooders.products,
      allowedModes: dogfooders.allowedModes,
      consent: dogfooders.consent,
    })
    .from(dogfooders)
    .where(eq(dogfooders.jovieUserId, user.id))
    .limit(1);

  return Boolean(
    row?.products.includes('jov') &&
      row.allowedModes.includes('early_access') &&
      hasEarlyAccessConsent(row.consent)
  );
}

export async function setEarlyAccess(
  userId: string,
  enabled: boolean,
  displayName: string
): Promise<boolean> {
  const [current] = await db
    .select()
    .from(dogfooders)
    .where(eq(dogfooders.jovieUserId, userId))
    .limit(1);
  const now = new Date().toISOString();

  if (!current && !enabled) return false;

  if (!current) {
    await db.insert(dogfooders).values({
      actorKey: `jovie-user:${userId}`,
      actorKind: 'external_human',
      displayName,
      tier: 'beta',
      products: ['jov'],
      jovieUserId: userId,
      consent: {
        grantedAt: now,
        scope: ['jov:early_access'],
        source: 'settings',
        revokedAt: null,
      },
      signalState: 'consented',
      allowedModes: ['customer_control', 'early_access'],
    });
    return true;
  }

  const products = enabled
    ? Array.from(new Set([...current.products, 'jov']))
    : current.products.filter(product => product !== 'jov');
  const allowedModes = enabled
    ? Array.from(new Set([...current.allowedModes, 'early_access']))
    : current.allowedModes.filter(mode => mode !== 'early_access');

  if (allowedModes.length === 0) allowedModes.push('customer_control');

  if (products.length === 0) {
    await db.delete(dogfooders).where(eq(dogfooders.id, current.id));
    return false;
  }

  await db
    .update(dogfooders)
    .set({
      products,
      allowedModes,
      consent: enabled
        ? {
            ...current.consent,
            grantedAt: now,
            source: 'settings',
            revokedAt: null,
          }
        : { ...current.consent, revokedAt: now },
      updatedAt: new Date(),
    })
    .where(eq(dogfooders.id, current.id));

  return enabled;
}
