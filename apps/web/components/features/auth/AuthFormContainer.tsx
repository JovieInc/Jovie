// @coverage-via apps/web/tests/unit/auth/auth-shell-layout-contract.test.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AuthFormContainerProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function AuthFormContainer({
  children,
  className,
}: Readonly<AuthFormContainerProps>) {
  return <div className={cn('w-full', className)}>{children}</div>;
}
