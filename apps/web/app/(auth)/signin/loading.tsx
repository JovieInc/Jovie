import { AuthPageSkeleton } from '@/features/auth';

/**
 * Loading skeleton for the sign-in page.
 */
export default function SignInLoading() {
  return (
    <AuthPageSkeleton
      formTitle='Log in to Jovie'
      showFormTitle={false}
      layoutVariant='stack'
    />
  );
}
