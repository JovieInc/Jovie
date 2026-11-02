/** Read-only public name-discovery copy. It offers invitation recovery, never account creation. */
export const HOMEPAGE_SEARCH_COPY = {
  label: 'Search your name',
  placeholder: 'Search your name',
  loading: 'Finding…',
  resultsLabel: 'Public profiles',
  empty:
    'No matching public profile yet. Join the waitlist to make your presence your own.',
  error:
    'Search is unavailable right now. You can still join the waitlist below.',
  waitlist: 'Join the waitlist',
  invite: 'Have an invite? Sign in',
} as const;
