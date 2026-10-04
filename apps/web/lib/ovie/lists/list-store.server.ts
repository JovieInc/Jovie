import 'server-only';
import { and, sql as drizzleSql, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import {
  applyListAction,
  createList,
  type ListAction,
  MAX_RATING,
  type OvList,
} from './model';

/**
 * Lists live in the durable Ovie operating KV (no new table, same as Summer
 * cards). Founder-dogfood scale: one row per list holding members and the
 * label log. Writes are compare-and-set on `updatedAt` with a short retry,
 * so two tabs never silently drop each other's swipes.
 */
const KEY_PREFIX = 'ov-list:';
const MAX_CAS_ATTEMPTS = 3;

const memberSchema = z.object({
  creatorId: z.string(),
  state: z.enum(['member', 'suggested', 'passed']),
  rating: z.number().int().min(1).max(MAX_RATING).nullable(),
  favorite: z.boolean(),
  source: z.enum(['manual', 'suggestion']),
  addedAt: z.string(),
  suggestionReasons: z.array(z.string()).optional(),
});

const labelSchema = z.object({
  creatorId: z.string(),
  signal: z.enum([
    'add',
    'remove',
    'swipe_right',
    'swipe_left',
    'rate',
    'favorite',
    'unfavorite',
    'suggest',
    'accept_suggestion',
    'reject_suggestion',
  ]),
  value: z.number().optional(),
  at: z.string(),
});

const storedListSchema = z.object({
  id: z.string(),
  name: z.string(),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(memberSchema),
  labels: z.array(labelSchema),
});

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export async function readList(id: string): Promise<OvList | null> {
  const [row] = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, keyFor(id)))
    .limit(1);
  if (!row) return null;
  const parsed = storedListSchema.safeParse(row.value);
  if (!parsed.success) throw new Error(`Ovie list ${id} is not a valid list`);
  return parsed.data;
}

export async function readAllLists(): Promise<OvList[]> {
  const createdAt = drizzleSql`${ovieOperatingKv.value}->>'createdAt'`;
  const rows = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(like(ovieOperatingKv.key, `${KEY_PREFIX}%`))
    .orderBy(createdAt);
  return rows.flatMap(row => {
    const parsed = storedListSchema.safeParse(row.value);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function insertList(input: {
  readonly name: string;
  readonly now?: Date;
}): Promise<OvList> {
  const now = (input.now ?? new Date()).toISOString();
  const list = createList({ id: crypto.randomUUID(), name: input.name, now });
  await db
    .insert(ovieOperatingKv)
    .values({ key: keyFor(list.id), value: list, updatedAt: new Date(now) });
  return list;
}

export async function deleteList(id: string): Promise<boolean> {
  const deleted = await db
    .delete(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, keyFor(id)))
    .returning({ key: ovieOperatingKv.key });
  return deleted.length === 1;
}

export type ListUpdateResult =
  | { readonly outcome: 'updated'; readonly list: OvList }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'conflict' };

/**
 * Apply actions to the latest stored list. Model errors (bad rating, not a
 * suggestion) propagate as ListModelError for a 400.
 */
export async function updateList(
  id: string,
  actions: readonly ListAction[],
  clock: () => Date = () => new Date()
): Promise<ListUpdateResult> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await readList(id);
    if (!current) return { outcome: 'not_found' };
    // The CAS token must strictly move, even for two writes in one millisecond.
    const now = new Date(
      Math.max(clock().getTime(), Date.parse(current.updatedAt) + 1)
    );
    const stamp = now.toISOString();
    const next = actions.reduce(
      (list, action) => applyListAction(list, action, stamp),
      current
    );
    const updated = await db
      .update(ovieOperatingKv)
      .set({ value: next, updatedAt: now })
      .where(
        and(
          eq(ovieOperatingKv.key, keyFor(id)),
          drizzleSql`${ovieOperatingKv.value}->>'updatedAt' = ${current.updatedAt}`
        )
      )
      .returning({ key: ovieOperatingKv.key });
    if (updated.length === 1) return { outcome: 'updated', list: next };
  }
  return { outcome: 'conflict' };
}
