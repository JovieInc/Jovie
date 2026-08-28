import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { AuthLayout } from './AuthLayout';

interface AuthPageSkeletonProps {
  readonly formTitle: string;
  readonly formTitleClassName?: string;
  readonly showFormTitle?: boolean;
  readonly showFooterPrompt?: boolean;
  readonly footerPrompt?: string;
  readonly footerLinkText?: string;
  readonly footerLinkHref?: string;
  readonly layoutVariant?: 'stack' | 'split';
  readonly chrome?: 'default' | 'splash-b';
}

export function AuthPageSkeleton({
  formTitle,
  formTitleClassName,
  showFormTitle,
  showFooterPrompt = false,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
  layoutVariant,
  chrome,
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
      layoutVariant={layoutVariant}
      chrome={chrome}
    >
      <AuthFormSkeleton />
    </AuthLayout>
  );
}
