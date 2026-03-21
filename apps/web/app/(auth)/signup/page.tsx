import type { Metadata } from 'next';
import { Suspense } from 'react';
import { APP_NAME, APP_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { PublicAuthLayout, SignUpForm } from '@/features/auth';
import { SignUpClaimDataPersistence } from './SignUpClaimDataPersistence';

export const metadata: Metadata = {
  title: `Sign Up | ${APP_NAME}`,
  description: 'Create your Jovie account with a one-time verification code.',
  alternates: {
    canonical: APP_ROUTES.SIGNUP,
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: `Sign Up | ${APP_NAME}`,
    description: 'Create your Jovie account with a one-time verification code.',
    url: new URL(APP_ROUTES.SIGNUP, APP_URL).toString(),
  },
};

export default function SignUpPage() {
  return (
    <PublicAuthLayout
      footerPrompt='Already have an account?'
      footerLinkText='Sign in'
      footerLinkHref={APP_ROUTES.SIGNIN}
    >
      <Suspense>
        <SignUpClaimDataPersistence />
      </Suspense>
      <SignUpForm />
    </PublicAuthLayout>
  );
}
