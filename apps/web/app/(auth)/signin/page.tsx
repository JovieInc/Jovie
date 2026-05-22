import { SignInPageClient } from './SignInPageClient';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignInPageClient />
    </Suspense>
  );
}
