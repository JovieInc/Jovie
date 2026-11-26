import 'server-only';

import { projectSummerInbox } from './inbox';
import { listSummerCards } from './summer-cards.server';

const SUMMER_INBOX_LIMIT = 100;

/**
 * The Inbox is Summer's asks of the founder only. Design, certification,
 * screenshot and Linear work keep their own pages.
 */
export async function readOvieInbox() {
  const [cards] = await Promise.allSettled([
    listSummerCards({ status: 'pending', limit: SUMMER_INBOX_LIMIT }),
  ]);
  const result = projectSummerInbox(
    cards.status === 'fulfilled' ? cards.value : []
  );
  return {
    ...result,
    issues: [
      ...result.issues,
      ...(cards.status === 'fulfilled' &&
      cards.value.length === SUMMER_INBOX_LIMIT
        ? ['Company decisions are limited to the newest 100 pending items.']
        : []),
      ...(cards.status === 'rejected'
        ? ['Company decisions could not be loaded. Retry to check this source.']
        : []),
    ],
  };
}
