/**
 * Load hints for the featured 104px PAC cover.
 *
 * That cover is the LCP element on the claim-invite landing (JOV-9611). It is
 * preloaded and tiny (~5 KB), so an interactive profile fetches it at high
 * priority and decodes it with the frame that first lays it out. With the
 * default async decode the first paint can go out without it and the next
 * frame waits behind hydration (observed element render delay ~1.1s vs ~0.1s
 * in CI). Previews keep the image defaults. The cover is always eager; a
 * `priority` image must not also set `loading`.
 */
export function featuredArtLoadHints(
  isInteractive: boolean,
  artPriority: boolean
): {
  readonly fetchPriority?: 'high';
  readonly decoding?: 'sync';
  readonly loading?: 'eager';
} {
  return {
    ...(isInteractive
      ? ({ fetchPriority: 'high', decoding: 'sync' } as const)
      : {}),
    ...(artPriority ? {} : ({ loading: 'eager' } as const)),
  };
}
