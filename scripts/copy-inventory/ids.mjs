// Collision-free copy IDs. ids.gen.json pins every ID that existed when
// sequential numbering stopped; those never change. A line with no pinned ID
// gets PREFIX-NNNNN from a hash of its own key, so two PRs that add copy at
// the same time never claim the same number and never edit a shared file.
// Derived numbers sit at or above DERIVED_MIN, above every sequential pin.

export const DERIVED_MIN = 10000;
const DERIVED_SPAN = 90000;

/** FNV-1a 32-bit of the UTF-8 key, mapped into [DERIVED_MIN, 99999]. */
export function derivedNumber(key) {
  let h = 0x811c9dc5;
  for (const byte of Buffer.from(key, 'utf8')) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return DERIVED_MIN + (h % DERIVED_SPAN);
}

/**
 * Returns assign(prefix, key) -> ID. Pinned keys keep their ID. Other keys get
 * their hash number; on the rare clash with a number already used under the
 * prefix, the later key steps to the next free number.
 * @param {Record<string, string>} pinned key -> ID from ids.gen.json
 */
export function createAssigner(pinned) {
  const ids = { ...pinned };
  const used = new Set(Object.values(pinned));
  const assign = (prefix, key) => {
    if (ids[key]) return ids[key];
    let n = derivedNumber(key);
    while (used.has(`${prefix}-${n}`))
      n = n + 1 > DERIVED_MIN + DERIVED_SPAN - 1 ? DERIVED_MIN : n + 1;
    ids[key] = `${prefix}-${n}`;
    used.add(ids[key]);
    return ids[key];
  };
  return { assign, ids };
}
