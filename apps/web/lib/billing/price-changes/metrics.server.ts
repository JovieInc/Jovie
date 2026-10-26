import 'server-only';

import { db } from '@/lib/db';
import { priceChangeNotices } from '@/lib/db/schema/price-changes';
import { DrizzleNoticeStore } from './drizzle-store';
import {
  type PriceChangeNoticeMetrics,
  summarizePriceChangeNotices,
} from './metrics';
import type { NoticeRow } from './types';

export async function getPriceChangeNoticeMetrics(): Promise<PriceChangeNoticeMetrics> {
  const store = new DrizzleNoticeStore();
  const [changes, rows] = await Promise.all([
    store.listAllChanges(),
    db.select().from(priceChangeNotices),
  ]);
  return summarizePriceChangeNotices(
    changes,
    rows.map(
      row =>
        ({
          changeId: row.changeId,
          subscriptionId: row.subscriptionId,
          status: row.status,
          appliedAt: row.appliedAt,
        }) as NoticeRow
    )
  );
}
