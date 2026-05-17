import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SignInPageClient } from './SignInPageClient';

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignInPageClient />
    </Suspense>
  );
}
