import { getClaimProfileIntent } from '@/data/marketingCtaIntents';

const claimLabel = getClaimProfileIntent().label;

/** Read-only public name-discovery copy. It offers sign-in recovery, never account creation. */
export const HOMEPAGE_SEARCH_COPY = {
  label: 'Search your name',
  placeholder: 'Search your name',
  loading: 'Finding…',
  resultsLabel: 'Public profiles',
  empty: `No matching public profile yet. ${claimLabel} to make your presence your own.`,
  limited: `This search preview is limited. ${claimLabel} to explore your presence with Jovie.`,
  error: `Search is unavailable right now. You can still ${claimLabel.toLowerCase()} below.`,
  claim: claimLabel,
  signin: 'Sign in',
} as const;
