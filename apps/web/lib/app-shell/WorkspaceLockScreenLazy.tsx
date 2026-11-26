'use client';

import dynamic from 'next/dynamic';

// Most sessions never see the lock screen, but importing it statically put
// the passkey client (@simplewebauthn/browser) in every signed-in route's
// first-load JS. It still renders on the server when the workspace starts
// locked, so a locked first paint shows the same screen with no flash.
export const WorkspaceLockScreenLazy = dynamic(() =>
  import('@/features/workspace-lock/WorkspaceLockScreen').then(
    module => module.WorkspaceLockScreen
  )
);
