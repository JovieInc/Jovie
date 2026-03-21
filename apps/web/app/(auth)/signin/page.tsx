import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { PublicAuthLayout, SignInForm } from '@/features/auth';

export const metadata: Metadata = {
  title: `Sign In | ${APP_NAME}`,
  description:
    'Sign in to your Jovie account with a one-time verification code.',
  alternates: {
    canonical: APP_ROUTES.SIGNIN,
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: `Sign In | ${APP_NAME}`,
    description:
      'Sign in to your Jovie account with a one-time verification code.',
    url: new URL(APP_ROUTES.SIGNIN, APP_URL).toString(),
  },
};

/**
 * Sign-in page using new Clerk Core API implementation.
 * No longer depends on Clerk Elements.
 */
export default function SignInPage() {
  return (
    <PublicAuthLayout
      footerPrompt="Don't have an account?"
      footerLinkText='Sign up'
      footerLinkHref={APP_ROUTES.SIGNUP}
    >
      <SignInForm />
    </PublicAuthLayout>
  );
}
