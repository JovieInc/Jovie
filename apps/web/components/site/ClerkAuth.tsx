'use client';

import { Show, SignInButton, SignUpButton } from '@clerk/nextjs';
import { UserButton } from '@/components/organisms/user-button';

/**
 * Client-side component to render Clerk authentication buttons.
 */
export default function ClerkAuth() {
  return (
    <>
      <Show when='signed-out'>
        <SignInButton mode='redirect'>Sign In</SignInButton>
        <SignUpButton mode='redirect'>Sign Up</SignUpButton>
      </Show>
      <Show when='signed-in'>
        <UserButton />
      </Show>
    </>
  );
}
