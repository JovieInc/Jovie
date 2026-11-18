'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { captureException } from '@/lib/sentry/client-lite';
import type { UserButton } from './UserButton';

type UserButtonProps = ComponentProps<typeof UserButton>;

/**
 * Stands in for the account button when its chunk cannot load (a stale tab
 * after a deploy, a dropped connection). The menu slot stays empty instead of
 * the rejected import reaching the route error boundary and replacing the
 * whole marketing page.
 */
function AccountButtonUnavailable(_props: UserButtonProps) {
  return null;
}

export function loadUserButton() {
  return import('./UserButton')
    .then(module => module.UserButton)
    .catch((error: unknown) => {
      captureException(error, { tags: { surface: 'marketing-account-slot' } });
      return AccountButtonUnavailable;
    });
}

/**
 * Code-split `UserButton` for surfaces that are signed out for almost every
 * visitor (the marketing header's mobile menu). Import this file directly,
 * not through the `user-button` barrel: the barrel re-exports `UserButton`
 * statically and would pull the account menu (passkey unlock, command
 * registry, notifications, usage metrics) back into the caller's chunk.
 */
export const LazyUserButton = dynamic(loadUserButton, {
  loading: () => null,
});
