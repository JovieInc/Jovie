/**
 * Parallel-route default fallback.
 *
 * The `@auth` slot is active only when an intercepting route under it matches
 * (e.g. `(.)signup`). For every other URL the slot must resolve to something,
 * so Next renders this default. Returning `null` keeps the slot dark — nothing
 * paints over the page, no layout shift, no accidental auth chrome leaking
 * into unrelated routes.
 */
export default function AuthSlotDefault() {
  return null;
}
