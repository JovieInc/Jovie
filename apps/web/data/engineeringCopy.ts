/**
 * /engineering copy, in the data-copy registry shape every sibling marketing
 * page uses (data/aboutCopy.ts, data/downloadCopy.ts). Copy lives here, not in
 * JSX, so the copy inventory and Copy Jam can see and rate it.
 *
 * ratchet: /engineering has no content-record kind yet. The `marketing-page`
 * kind is homepage-shaped (strict section + variant schema) and `site-chrome`
 * covers header and footer only. Migrate these lines into a content record
 * when a page-copy kind lands for editorial index pages (content-records
 * program, #23536).
 */
export const ENGINEERING_COPY = {
  emptyIndexExplainer:
    'Each note is written from work that has already shipped, with the pull request, the checks that passed, and the result linked as evidence. Nothing is published until it is approved, so this index only ever lists finished work.',
} as const;
