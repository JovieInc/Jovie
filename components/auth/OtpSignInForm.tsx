'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignIn from '@clerk/elements/sign-in';
import { Card, CardContent } from '@jovie/ui';
import { AuthInput, OtpInput } from './atoms';
import { ButtonSpinner } from './ButtonSpinner';

const FIELD_ERROR_CLASSES =
  'mt-2 text-sm text-red-400 text-center animate-in fade-in-0 duration-200';
const SUBMIT_BUTTON_CLASSES =
  'w-full rounded-lg bg-[#e8e8e8] hover:bg-white disabled:opacity-70 disabled:cursor-not-allowed text-[#101012] font-medium py-3 px-4 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012]';
const STEP_TRANSITION_CLASSES =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out';
const LINK_CLASSES =
  'w-full text-center text-sm text-secondary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012] rounded';

export function OtpSignInForm() {
  return (
    <SignIn.Root routing='path' path='/signin'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0'>
          {/* Fixed height container to prevent layout shift when error appears */}
          <div className='min-h-[24px]' role='alert' aria-live='polite'>
            <Clerk.GlobalError className='text-sm text-destructive text-center' />
          </div>

          <SignIn.Step name='start' aria-label='Enter your email address'>
            <div className={`space-y-4 ${STEP_TRANSITION_CLASSES}`}>
              <Clerk.Field name='identifier'>
                <Clerk.Label className='sr-only'>Email Address</Clerk.Label>
                <AuthInput type='email' placeholder='Email Address' />
                <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
              </Clerk.Field>

              <Clerk.Loading>
                {isLoading => (
                  <SignIn.Action
                    submit
                    className={SUBMIT_BUTTON_CLASSES}
                    disabled={isLoading}
                    aria-busy={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <ButtonSpinner />
                        <span>Sending code...</span>
                      </>
                    ) : (
                      'Continue with Email'
                    )}
                  </SignIn.Action>
                )}
              </Clerk.Loading>
            </div>
          </SignIn.Step>

          <SignIn.Step
            name='verifications'
            aria-label='Verify your email with code'
          >
            <SignIn.Strategy name='email_code'>
              <div className={`space-y-4 ${STEP_TRANSITION_CLASSES}`}>
                <p
                  className='text-sm text-secondary text-center'
                  id='otp-description'
                >
                  We sent a 6-digit code to your email
                </p>

                <Clerk.Field name='code'>
                  <Clerk.Label className='sr-only'>
                    Verification code
                  </Clerk.Label>
                  <OtpInput
                    autoSubmit
                    aria-label='Enter 6-digit verification code'
                  />
                  <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
                </Clerk.Field>

                <Clerk.Loading>
                  {isLoading => (
                    <SignIn.Action
                      submit
                      className={SUBMIT_BUTTON_CLASSES}
                      disabled={isLoading}
                      aria-busy={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <ButtonSpinner />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        'Verify Code'
                      )}
                    </SignIn.Action>
                  )}
                </Clerk.Loading>

                <SignIn.Action navigate='start' className={LINK_CLASSES}>
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
