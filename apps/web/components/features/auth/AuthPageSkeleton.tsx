// @coverage-via apps/web/tests/unit/auth/auth-page-skeleton.test.tsx
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

function SplashBAuthFormSkeleton() {
  return (
    <div className='relative min-h-96' data-auth-splash-b-skeleton>
      <div data-auth-sso-surface>
        <div className='mb-4 text-center'>
          <div className='mx-auto h-7 w-44 rounded-full bg-white/[0.08]' />
        </div>

        <div className='grid grid-cols-1 gap-1.5'>
          <div className='h-8 rounded-full bg-white/[0.08]' />
          <div className='h-8 rounded-full bg-white/[0.06]' />
        </div>

        <div className='mt-4'>
          <div className='mb-4 flex items-center gap-3' aria-hidden='true'>
            <span className='h-px flex-1 bg-white/[0.08]' />
            <span className='h-3 w-5 rounded-full bg-white/[0.06]' />
            <span className='h-px flex-1 bg-white/[0.08]' />
          </div>
          <div className='h-8 rounded-full bg-white/[0.08]' />
        </div>

        <div className='mt-3 min-h-5' />
        <div className='mx-auto mt-5 h-5 w-40 rounded-full bg-white/[0.06]' />
        <div className='mx-auto mt-8 h-10 w-64 max-w-full rounded-lg bg-white/[0.05]' />
      </div>
    </div>
  );
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
      {chrome === 'splash-b' ? (
        <SplashBAuthFormSkeleton />
      ) : (
        <AuthFormSkeleton />
      )}
    </AuthLayout>
  );
}
