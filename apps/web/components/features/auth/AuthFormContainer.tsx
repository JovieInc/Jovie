import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { Container } from '@/components/site/Container';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/features/auth/constants';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

interface AuthFormContainerProps {
  readonly children: ReactNode;
  readonly title: string;
}

export function AuthFormContainer({
  children,
  title,
}: Readonly<AuthFormContainerProps>) {
  return (
    <div className='flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-8 xl:px-12'>
      <Container className={`mx-auto w-full ${AUTH_FORM_MAX_WIDTH_CLASS}`}>
        {/* Mobile header - only shown on mobile */}
        <div
          className={cn(
            FORM_LAYOUT.headerSection,
            'mb-8 text-primary-token lg:hidden'
          )}
        >
          <div className='mb-4'>
            <BrandLogo size={56} tone='auto' className='mx-auto' />
          </div>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
        </div>

        {/* Form content */}
        {children}
      </Container>
    </div>
  );
}
