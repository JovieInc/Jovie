'use client';

import {
  Input as ClerkInput,
  Field,
  FieldError,
  Label,
} from '@clerk/elements/common';
import { SignUp } from '@clerk/elements/sign-up';
import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthFormSkeleton } from '@/components/ui/LoadingSkeleton';

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect_url') || '/dashboard';

  return (
    <AuthLayout
      brandingTitle='Join Jovie today'
      brandingDescription='Create your profile in minutes and start sharing your story with a beautiful, conversion-optimized page.'
      formTitle='Create your account'
      gradientFrom='purple-600'
      gradientVia='cyan-600'
      gradientTo='blue-600'
      textColorClass='text-purple-100'
    >
      <div className='min-h-[500px]'>
        <ClerkLoading>
          <AuthFormSkeleton />
        </ClerkLoading>
        <ClerkLoaded>
          <SignUp
            routing='hash'
            afterSignUpUrl={redirectUrl}
            signInUrl='/signin'
          >
            <div className='space-y-4'>
              <Field name='emailAddress'>
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
                  <Input type='password' placeholder='Create a password' />
                </ClerkInput>
                <FieldError />
              </Field>

              <Button type='submit' className='w-full'>
                Create account
              </Button>

              <p className='text-center text-sm text-gray-600 dark:text-gray-400'>
                Already have an account?{' '}
                <Link
                  href='/signin'
                  className='text-purple-600 hover:text-purple-500 font-medium'
                >
                  Sign in
                </Link>
              </p>
            </div>
          </SignUp>
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
