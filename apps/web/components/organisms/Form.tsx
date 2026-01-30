import React from 'react';
import { FormStatus } from '@/components/molecules/FormStatus';
import { cn } from '@/lib/utils';

interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  readonly children: React.ReactNode;
  readonly loading?: boolean;
  readonly error?: string;
  readonly success?: string;
  readonly onSubmit?: (e: React.FormEvent) => void;
}

export function Form({
  children,
  loading = false,
  error,
  success,
  onSubmit,
  className,
  ...props
}: FormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('space-y-4', className)}
      {...props}
    >
      {children}
      <FormStatus loading={loading} error={error} success={success} />
    </form>
  );
}
