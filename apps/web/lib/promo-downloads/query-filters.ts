import 'server-only';

import { and, eq } from 'drizzle-orm';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';

export function activeAttestedPromoDownloadsForRelease(releaseId: string) {
  return and(
    eq(promoDownloads.releaseId, releaseId),
    eq(promoDownloads.isActive, true),
    eq(promoDownloads.rightsControlAttested, true)
  );
}
