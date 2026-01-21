import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/components/auth/constants';
import { Container } from '@/components/site/Container';

interface AuthFormContainerProps {
  children: ReactNode;
  title: string;
}

export function AuthFormContainer({
  children,
  title,
}: Readonly<AuthFormContainerProps>) {
  return (
    <div className='flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 xl:px-12'>
      <Container className={`w-full ${AUTH_FORM_MAX_WIDTH_CLASS} mx-auto`}>
        {/* Mobile header - only shown on mobile */}
        <div className='text-center mb-8 lg:hidden text-primary-token'>
          <div className='mb-4'>
            <BrandLogo size={56} tone='auto' className='mx-auto' />
          </div>
          <h1 className='text-2xl font-bold'>{title}</h1>
        </div>

        {/* Form content */}
        {children}
      </Container>
    </div>
  );
}
