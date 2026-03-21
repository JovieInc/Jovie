'use client';

import { SignInButton, SignUpButton, useAuth } from '@clerk/nextjs';
import { UserButton } from '@/components/organisms/user-button';

/**
 * Client-side component to render Clerk authentication buttons.
 */
export default function ClerkAuth() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <>
      {(!isLoaded || !isSignedIn) && (
        <>
          <SignInButton mode='redirect'>Sign In</SignInButton>
          <SignUpButton mode='redirect'>Sign Up</SignUpButton>
        </>
      )}
      {isLoaded && isSignedIn ? <UserButton /> : null}
    </>
  );
}
