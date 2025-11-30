'use client';

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';

/**
 * Client-side component to render Clerk authentication buttons.
 */
export default function ClerkAuth() {
  return (
    <>
      <SignedOut>
        <SignInButton mode='redirect'>Sign In</SignInButton>
        <SignUpButton mode='redirect'>Sign Up</SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  );
}
