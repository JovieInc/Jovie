'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignIn from '@clerk/elements/sign-in';
import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';

export function OtpSignInForm() {
  return (
    <SignIn.Root routing='path' path='/signin'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0'>
          <Clerk.GlobalError className='text-sm text-destructive' />

          <SignIn.Step name='start' aria-label='Enter your email address'>
            <div className='space-y-4'>
              <Clerk.Field name='identifier'>
                <Clerk.Label className='block text-sm font-medium text-secondary-token mb-1'>
                  Email address
                </Clerk.Label>
                <Clerk.Input
                  type='email'
                  className='w-full px-3 py-2 rounded-lg border border-input bg-background text-primary-token focus:outline-none focus:ring-2 focus:ring-ring focus:border-input'
                />
                <Clerk.FieldError className='mt-1 text-sm text-destructive' />
              </Clerk.Field>

              <SignIn.Action
                submit
                className='w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Send code
              </SignIn.Action>

              <div className='text-center text-sm text-secondary-token'>
                Don&apos;t have an account?{' '}
                <Link
                  href='/signup'
                  className='text-accent hover:underline font-medium'
                >
                  Sign up
                </Link>
              </div>
            </div>
          </SignIn.Step>

          <SignIn.Step
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
                  className='w-full px-3 py-2 rounded-lg border border-input bg-background text-primary-token tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-ring focus:border-input'
                />
                <Clerk.FieldError className='mt-1 text-sm text-destructive' />
              </Clerk.Field>

              <SignIn.Action
                submit
                className='w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Continue
              </SignIn.Action>

              <div className='text-center text-sm text-secondary-token'>
                Don&apos;t have an account?{' '}
                <Link
                  href='/signup'
                  className='text-accent hover:underline font-medium'
                >
                  Sign up
                </Link>
              </div>
            </div>
          </SignIn.Step>
        </CardContent>
      </Card>
    </SignIn.Root>
  );
}
