import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { AuthLayout } from './AuthLayout';

interface AuthPageSkeletonProps {
  formTitle: string;
  formTitleClassName?: string;
  showFormTitle?: boolean;
  showFooterPrompt?: boolean;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
}

export function AuthPageSkeleton({
  formTitle,
  formTitleClassName,
  showFormTitle,
  showFooterPrompt,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
}: Readonly<AuthPageSkeletonProps>) {
  return (
    <AuthLayout
      formTitle={formTitle}
      formTitleClassName={formTitleClassName}
      showFormTitle={showFormTitle}
      showFooterPrompt={showFooterPrompt}
      footerPrompt={footerPrompt}
      footerLinkText={footerLinkText}
      footerLinkHref={footerLinkHref}
    >
      <AuthFormSkeleton />
    </AuthLayout>
  );
}
