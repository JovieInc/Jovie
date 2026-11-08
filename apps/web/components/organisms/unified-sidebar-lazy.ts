import dynamic from 'next/dynamic';

// Founder-only (OV) block: split out so creator routes never ship it.
export const OperatorListsNav = dynamic(() =>
  import('./OperatorListsNav').then(module => module.OperatorListsNav)
);

// Split (still server-rendered) so its motion spring stays out of the shell's
// first-load chunk, which every signed-in page evaluates during hydration.
export const ProfileCompletionCard = dynamic(() =>
  import('@/features/dashboard/molecules/ProfileCompletionCard').then(
    module => module.ProfileCompletionCard
  )
);
