import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { AuthLayout } from './AuthLayout';

interface AuthPageSkeletonProps {
  formTitle: string;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
}

export function AuthPageSkeleton({
  formTitle,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
}: AuthPageSkeletonProps) {
  return (
    <AuthLayout
      formTitle={formTitle}
      footerPrompt={footerPrompt}
      footerLinkText={footerLinkText}
      footerLinkHref={footerLinkHref}
    >
      <AuthFormSkeleton />
    </AuthLayout>
  );
}
