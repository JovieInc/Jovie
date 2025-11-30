'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignUp from '@clerk/elements/sign-up';
import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';

export function OtpSignUpForm() {
  return (
    <SignUp.Root routing='path' path='/signup'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0'>
          <Clerk.GlobalError className='text-sm text-destructive' />

          <SignUp.Step name='start' aria-label='Enter your email address'>
            <div className='space-y-4'>
              <Clerk.Field name='emailAddress'>
                <Clerk.Label className='block text-sm font-medium text-secondary-token mb-1'>
                  Email address
                </Clerk.Label>
                <Clerk.Input
                  type='email'
                  className='w-full px-3 py-2 rounded-lg border border-subtle bg-(--bg) text-primary-token focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'
                />
                <Clerk.FieldError className='mt-1 text-sm text-destructive' />
              </Clerk.Field>

              <SignUp.Action
                submit
                className='w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Send code
              </SignUp.Action>

              <div className='text-center text-sm text-secondary-token'>
                Already have an account?{' '}
                <Link
                  href='/signin'
                  className='text-accent hover:underline font-medium'
                >
                  Sign in
                </Link>
              </div>
            </div>
          </SignUp.Step>

          <SignUp.Step
            name='verifications'
            aria-label='Verify your email with code'
          >
            <div className='space-y-4'>
              <Clerk.Field name='code'>
                <Clerk.Label className='block text-sm font-medium text-secondary-token mb-1'>
                  Enter the code we emailed you
                </Clerk.Label>
                <Clerk.Input
                  type='text'
                  className='w-full px-3 py-2 rounded-lg border border-subtle bg-(--bg) text-primary-token tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'
                />
                <Clerk.FieldError className='mt-1 text-sm text-destructive' />
              </Clerk.Field>

              <SignUp.Action
                submit
                className='w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Continue
              </SignUp.Action>

              <div className='text-center text-sm text-secondary-token'>
                Already have an account?{' '}
                <Link
                  href='/signin'
                  className='text-accent hover:underline font-medium'
                >
                  Sign in
                </Link>
              </div>
            </div>
          </SignUp.Step>
        </CardContent>
      </Card>
    </SignUp.Root>
  );
}
