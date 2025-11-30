'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignIn from '@clerk/elements/sign-in';
import { Card, CardContent } from '@jovie/ui';

export function OtpSignInForm() {
  return (
    <SignIn.Root routing='path' path='/signin'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-6 p-0'>
          <Clerk.GlobalError className='text-sm text-red-500' />

          <SignIn.Step name='start'>
            <div className='space-y-4'>
              <Clerk.Field name='identifier'>
                <Clerk.Label className='block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1'>
                  Email address
                </Clerk.Label>
                <Clerk.Input
                  type='email'
                  className='w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                />
                <Clerk.FieldError className='mt-1 text-sm text-red-500' />
              </Clerk.Field>

              <SignIn.Action
                submit
                className='w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Send code
              </SignIn.Action>
            </div>
          </SignIn.Step>

          <SignIn.Step name='verifications'>
            <div className='space-y-4'>
              <Clerk.Field name='code'>
                <Clerk.Label className='block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1'>
                  Enter the code we emailed you
                </Clerk.Label>
                <Clerk.Input
                  type='text'
                  className='w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                />
                <Clerk.FieldError className='mt-1 text-sm text-red-500' />
              </Clerk.Field>

              <SignIn.Action
                submit
                className='w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center'
              >
                Continue
              </SignIn.Action>
            </div>
          </SignIn.Step>
        </CardContent>
      </Card>
    </SignIn.Root>
  );
}
