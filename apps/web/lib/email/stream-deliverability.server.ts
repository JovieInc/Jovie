import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { env } from '@/lib/env-server';
import {
  type DeliveryCountRow,
  summarizeDeliverability,
} from './stream-deliverability';
import { EMAIL_STREAM_REGISTRY } from './streams';

const WINDOW_DAYS = EMAIL_STREAM_REGISTRY.deliverability.windowDays;

export async function loadStreamDeliverability(now = new Date()) {
  const result = await db.execute(drizzleSql`
    SELECT metadata->>'senderDomain' AS "senderDomain",
           status::text AS status,
           count(*)::int AS count
    FROM notification_delivery_log
    WHERE channel = 'email'
      AND status IN ('delivered', 'bounced', 'complained')
      AND created_at > now() - make_interval(days => ${WINDOW_DAYS})
    GROUP BY 1, 2
  `);
  const rows = (result.rows ?? result) as unknown as DeliveryCountRow[];
  return summarizeDeliverability(rows, env, WINDOW_DAYS, now);
}
