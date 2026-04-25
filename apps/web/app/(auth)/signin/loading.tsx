import { AuthPageSkeleton } from '@/features/auth';

/**
 * Loading skeleton for the sign-in page.
 */
export default function SignInLoading() {
  return (
    <AuthPageSkeleton
      formTitle='Sign in'
      showFormTitle={false}
      layoutVariant='split'
    />
  );
}
