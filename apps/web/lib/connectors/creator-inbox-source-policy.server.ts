import 'server-only';

import { and, ne, notIlike } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { OPERATOR_INBOX_SOURCE_PREFIXES } from './creator-inbox-source-policy';
import { WORKFLOW_CAPTURE_REQUEST_KIND } from './suggested-action-kinds';

/** Apply before selecting payloads or limiting the creator projection. */
export function creatorInboxSourceCondition(column: AnyPgColumn) {
  return and(
    ne(column, WORKFLOW_CAPTURE_REQUEST_KIND),
    ...OPERATOR_INBOX_SOURCE_PREFIXES.map(prefix =>
      notIlike(column, `${prefix}%`)
    )
  );
}
