import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { AuthLayout } from './AuthLayout';

interface AuthPageSkeletonProps {
  formTitle: string;
  formTitleClassName?: string;
  showFormTitle?: boolean;
  showLegalLinks?: boolean;
  showFooterPrompt?: boolean;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
}

export function AuthPageSkeleton({
  formTitle,
  formTitleClassName,
  showFormTitle,
  showLegalLinks,
  showFooterPrompt,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
}: AuthPageSkeletonProps) {
  return (
    <AuthLayout
      formTitle={formTitle}
      formTitleClassName={formTitleClassName}
      showFormTitle={showFormTitle}
      showLegalLinks={showLegalLinks}
      showFooterPrompt={showFooterPrompt}
      footerPrompt={footerPrompt}
      footerLinkText={footerLinkText}
      footerLinkHref={footerLinkHref}
    >
      <AuthFormSkeleton />
    </AuthLayout>
  );
}
