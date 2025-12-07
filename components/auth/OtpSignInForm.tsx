'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignIn from '@clerk/elements/sign-in';
import { Card, CardContent } from '@jovie/ui';
import { AuthInput } from './atoms';

const FIELD_ERROR_CLASSES = 'mt-1 text-sm text-red-400';
const SUBMIT_BUTTON_CLASSES =
  'w-full rounded-lg bg-[#e8e8e8] hover:bg-white text-[#101012] font-medium py-3 px-4 transition-colors';

export function OtpSignInForm() {
  return (
    <SignIn.Root routing='path' path='/signin'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0'>
          <Clerk.GlobalError className='text-sm text-destructive' />

          <SignIn.Step name='start' aria-label='Enter your email address'>
            <div className='space-y-4'>
              <Clerk.Field name='identifier'>
                <AuthInput type='email' placeholder='Email Address' />
                <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
              </Clerk.Field>

              <SignIn.Action submit className={SUBMIT_BUTTON_CLASSES}>
                Continue with Email
              </SignIn.Action>
            </div>
          </SignIn.Step>

          <SignIn.Step
            name='verifications'
            aria-label='Verify your email with code'
          >
            <SignIn.Strategy name='email_code'>
              <div className='space-y-4'>
                <p className='text-sm text-secondary text-center'>
                  We sent a code to your email
                </p>

                <Clerk.Field name='code'>
                  <AuthInput
                    type='text'
                    inputMode='numeric'
                    autoComplete='one-time-code'
                    maxLength={6}
                    variant='otp'
                    placeholder='Enter code'
                  />
                  <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
                </Clerk.Field>

                <SignIn.Action submit className={SUBMIT_BUTTON_CLASSES}>
                  Continue
                </SignIn.Action>

                <SignIn.Action
                  navigate='start'
                  className='w-full text-center text-sm text-secondary hover:text-primary transition-colors'
                >
                  ← Use a different email
                </SignIn.Action>
              </div>
            </SignIn.Strategy>
          </SignIn.Step>
        </CardContent>
      </Card>
    </SignIn.Root>
  );
}
