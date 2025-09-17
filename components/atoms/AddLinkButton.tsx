'use client';

import { PlusIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface AddLinkButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function AddLinkButton({
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'default',
  className,
  children = 'Add Link',
}: AddLinkButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size={size}
      className={cn('gap-2', className)}
    >
      <PlusIcon className='h-4 w-4' />
      {children}
    </Button>
  );
}
