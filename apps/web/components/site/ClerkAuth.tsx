'use client';

import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { UserButton } from '@/components/organisms/user-button';
import { useAuthSafe } from '@/hooks/useClerkSafe';

/**
 * Client-side component to render Clerk authentication buttons.
 */
export default function ClerkAuth() {
  const { isSignedIn } = useAuthSafe();

  if (isSignedIn) {
    return <UserButton />;
  }

  return (
    <>
      <SignInButton mode='redirect'>Sign In</SignInButton>
      <SignUpButton mode='redirect'>Sign Up</SignUpButton>
    </>
  );
}
