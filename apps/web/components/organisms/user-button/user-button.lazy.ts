'use client';

import dynamic from 'next/dynamic';

/**
 * Code-split `UserButton` for surfaces that are signed out for almost every
 * visitor (the marketing header's mobile menu). Import this file directly,
 * not through the `user-button` barrel: the barrel re-exports `UserButton`
 * statically and would pull the account menu (passkey unlock, command
 * registry, notifications, usage metrics) back into the caller's chunk.
 */
export const LazyUserButton = dynamic(() =>
  import('./UserButton').then(module => module.UserButton)
);
