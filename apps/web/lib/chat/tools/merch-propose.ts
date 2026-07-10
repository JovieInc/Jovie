import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchCards } from '@/lib/db/schema/merch';
import { formatMerchMoney } from '@/lib/merch/pricing';

export type MerchProposeAction = 'publish' | 'archive' | 'unpause' | 'pause';

export type MerchActionToolResult =
  | {
      readonly success: true;
      readonly action:
        | 'publish_merch'
        | 'archive_merch'
        | 'unpause_merch'
        | 'pause_merch';
      readonly merchCardId: string;
      readonly title: string;
      readonly currentStatus: string;
      readonly retailPrice: string;
      readonly primaryImageUrl: string | null;
    }
  | {
      readonly success: false;
      readonly error: string;
    };

const ACTION_BY_PROPOSE: Record<
  MerchProposeAction,
  'publish_merch' | 'archive_merch' | 'unpause_merch' | 'pause_merch'
> = {
  publish: 'publish_merch',
  archive: 'archive_merch',
  unpause: 'unpause_merch',
  pause: 'pause_merch',
};

export async function proposeMerchAction(params: {
  readonly action: MerchProposeAction;
  readonly merchCardId: string;
  readonly profileId: string;
}): Promise<MerchActionToolResult> {
  const [card] = await db
    .select({
      id: merchCards.id,
      title: merchCards.title,
      status: merchCards.status,
      retailPriceCents: merchCards.retailPriceCents,
      primaryImageUrl: merchCards.primaryImageUrl,
    })
    .from(merchCards)
    .where(
      and(
        eq(merchCards.id, params.merchCardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .limit(1);

  if (!card) {
    return { success: false, error: 'Merch card not found' };
  }

  return {
    success: true,
    action: ACTION_BY_PROPOSE[params.action],
    merchCardId: card.id,
    title: card.title,
    currentStatus: card.status,
    retailPrice: formatMerchMoney(card.retailPriceCents),
    primaryImageUrl: card.primaryImageUrl,
  };
}
