import type { ReactNode } from 'react';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/features/auth/constants';
import { cn } from '@/lib/utils';

interface AuthFormContainerProps {
  readonly children: ReactNode;
}

export function AuthFormContainer({
  children,
}: Readonly<AuthFormContainerProps>) {
  return (
    <div className='w-full px-4 sm:px-6'>
      <div className={cn('mx-auto w-full', AUTH_FORM_MAX_WIDTH_CLASS)}>
        {children}
      </div>
    </div>
  );
}
