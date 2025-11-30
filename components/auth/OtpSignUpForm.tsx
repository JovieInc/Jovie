'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignUp from '@clerk/elements/sign-up';
import { Card, CardContent } from '@jovie/ui';

export function OtpSignUpForm() {
  return (
    <SignUp.Root routing='path' path='/signup'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0'>
          <Clerk.GlobalError className='text-sm text-red-500' />

          <SignUp.Step name='start'>
            <div className='space-y-4'>
              <Clerk.Field name='emailAddress'>
                <Clerk.Label className='block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1'>
                  Email address
                </Clerk.Label>
                <Clerk.Input
                  type='email'
                  className='w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500'
                />
                <Clerk.FieldError className='mt-1 text-sm text-red-500' />
              </Clerk.Field>

              <SignUp.Action
                submit
                className='w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Send code
              </SignUp.Action>
            </div>
          </SignUp.Step>

          <SignUp.Step name='verifications'>
            <div className='space-y-4'>
              <Clerk.Field name='code'>
                <Clerk.Label className='block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1'>
                  Enter the code we emailed you
                </Clerk.Label>
                <Clerk.Input
                  type='text'
                  className='w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500'
                />
                <Clerk.FieldError className='mt-1 text-sm text-red-500' />
              </Clerk.Field>

              <SignUp.Action
                submit
                className='w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Continue
              </SignUp.Action>
            </div>
          </SignUp.Step>
        </CardContent>
      </Card>
    </SignUp.Root>
  );
}
