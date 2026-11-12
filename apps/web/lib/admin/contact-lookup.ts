import 'server-only';

import {
  buildCanonicalContacts,
  type CanonicalContactListRow,
} from './contacts';

/** Resolve many queue identities from one canonical projection, with no writes. */
export async function getCanonicalContactsByKeys(
  keys: readonly string[]
): Promise<Map<string, CanonicalContactListRow>> {
  if (!keys.length) return new Map();
  const wanted = new Set(keys);
  const all = await buildCanonicalContacts();
  return new Map(
    all
      .filter(row => wanted.has(row.dedupeKey))
      .map(row => [row.dedupeKey, row])
  );
}
