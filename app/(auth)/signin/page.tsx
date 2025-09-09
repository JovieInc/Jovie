'use client';

import {
  Input as ClerkInput,
  Field,
  FieldError,
  Label,
} from '@clerk/elements/common';
import { SignIn } from '@clerk/elements/sign-in';
import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthFormSkeleton } from '@/components/ui/LoadingSkeleton';

export default function SignInPage() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect_url') || '/dashboard';

  return (
    <AuthLayout
      brandingTitle='Welcome back to Jovie'
      brandingDescription='Sign in to manage your profile, track your analytics, and share your story with the world.'
      formTitle='Sign in to Jovie'
      gradientFrom='blue-600'
      gradientVia='purple-600'
      gradientTo='cyan-600'
      textColorClass='text-blue-100'
    >
      <div className='min-h-[400px]'>
        <ClerkLoading>
          <AuthFormSkeleton />
        </ClerkLoading>
        <ClerkLoaded>
          <SignIn.Root
            routing='hash'
            redirectUrl={redirectUrl}
            afterSignInUrl={redirectUrl}
            afterSignUpUrl={redirectUrl}
            signUpUrl='/signup'
          >
            <SignIn.Step name='start'>
              <div className='space-y-4'>
                <Field name='identifier'>
                  <Label>Email</Label>
                  <ClerkInput asChild>
                    <Input
                      type='email'
                      autoComplete='email'
                      placeholder='you@example.com'
                    />
                  </ClerkInput>
                  <FieldError />
                </Field>

                <Field name='password'>
                  <Label>Password</Label>
                  <ClerkInput asChild>
                    <Input type='password' placeholder='Your password' />
                  </ClerkInput>
                  <FieldError />
                </Field>

                <SignIn.Action submit asChild>
                  <Button className='w-full'>Sign in</Button>
                </SignIn.Action>

                <p className='text-center text-sm text-gray-600 dark:text-gray-400'>
                  New to Jovie?{' '}
                  <Link
                    href='/signup'
                    className='text-blue-600 hover:text-blue-500 font-medium'
                  >
                    Create an account
                  </Link>
                </p>
              </div>
            </SignIn.Step>
          </SignIn.Root>
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
