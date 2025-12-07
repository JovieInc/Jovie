'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignUp from '@clerk/elements/sign-up';
import { Card, CardContent } from '@jovie/ui';
import { AuthFooterLink, AuthInput } from './atoms';

const FIELD_LABEL_CLASSES =
  'block text-sm font-medium text-secondary-token mb-1';
const FIELD_ERROR_CLASSES = 'mt-1 text-sm text-destructive';
const SUBMIT_BUTTON_CLASSES = 'btn btn-primary w-full justify-center';

export function OtpSignUpForm() {
  return (
    <SignUp.Root routing='path' path='/signup'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0 min-h-[260px]'>
          <Clerk.GlobalError className='text-sm text-destructive' />

          <SignUp.Step name='start' aria-label='Enter your email address'>
            <div className='space-y-4'>
              <Clerk.Field name='emailAddress'>
                <Clerk.Label className={FIELD_LABEL_CLASSES}>
                  Email address
                </Clerk.Label>
                <AuthInput type='email' />
                <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
              </Clerk.Field>

              <SignUp.Action submit className={SUBMIT_BUTTON_CLASSES}>
                Send code
              </SignUp.Action>

              <AuthFooterLink
                prompt='Already have an account?'
                href='/signin'
                linkText='Sign in'
              />
            </div>
          </SignUp.Step>

          <SignUp.Step
            name='verifications'
            aria-label='Verify your email with code'
          >
            <div className='space-y-4'>
              <Clerk.Field name='code'>
                <Clerk.Label className={FIELD_LABEL_CLASSES}>
                  Enter the code we emailed you
                </Clerk.Label>
                <AuthInput
                  type='text'
                  inputMode='numeric'
                  autoComplete='one-time-code'
                  maxLength={6}
                  variant='otp'
                />
                <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
              </Clerk.Field>

              <SignUp.Action submit className={SUBMIT_BUTTON_CLASSES}>
                Continue
              </SignUp.Action>

              <AuthFooterLink
                prompt='Already have an account?'
                href='/signin'
                linkText='Sign in'
              />
            </div>
          </SignUp.Step>
        </CardContent>
      </Card>
    </SignUp.Root>
  );
}
