import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { IdentityPageClient } from './IdentityPageClient';

export const dynamic = 'force-dynamic';

export default function IdentityPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <IdentityPageClient />
    </Suspense>
  );
}
