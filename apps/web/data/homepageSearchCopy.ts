/** Read-only public name-discovery copy. It offers sign-in recovery, never account creation. */
export const HOMEPAGE_SEARCH_COPY = {
  label: 'Search your name',
  placeholder: 'Search your name',
  loading: 'Finding…',
  resultsLabel: 'Public profiles',
  empty:
    'No matching public profile yet. Claim your handle to make your presence your own.',
  limited:
    'This search preview is limited. Claim your handle to explore your presence with Jovie.',
  error:
    'Search is unavailable right now. You can still claim your handle below.',
  claim: 'Claim your handle',
  signin: 'Sign in',
} as const;
