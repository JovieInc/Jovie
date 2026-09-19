import { AuthPageSkeleton } from '@/features/auth';

/**
 * Loading skeleton for the sign-up page.
 */
export default function SignUpLoading() {
  return (
    <AuthPageSkeleton
      formTitle='Continue to Jovie'
      showFormTitle={false}
      layoutVariant='stack'
    />
  );
}
