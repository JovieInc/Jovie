'use client';

import Link from 'next/link';
import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';

interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  icon: React.ReactNode;
  href?: string;
  ariaLabel: string;
}

/**
 * Icon-only button built on top of the shared Button component.
 */
export function IconButton({
  icon,
  href,
  ariaLabel,
  ...props
}: IconButtonProps) {
  const Component = href ? Link : 'button';

  return (
    <Button
      as={Component}
      href={href}
      size='icon'
      aria-label={ariaLabel}
      {...props}
    >
      {icon}
    </Button>
  );
}
