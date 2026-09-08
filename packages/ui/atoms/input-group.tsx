'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface InputGroupProps extends React.ComponentPropsWithoutRef<'div'> {
  /**
   * Size variant to match Input size
   */
  readonly size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: '[&>[data-slot=icon]]:size-4 [&>[data-slot=icon]:first-child]:left-2 [&>*+[data-slot=icon]]:right-2 [&:has(>[data-slot=icon]:first-child)_input]:pl-8 [&:has(>*+[data-slot=icon])_input]:pr-8',
  md: '[&>[data-slot=icon]]:size-3.5 [&>[data-slot=icon]:first-child]:left-3 [&>*+[data-slot=icon]]:right-3 [&:has(>[data-slot=icon]:first-child)_input]:pl-9 [&:has(>*+[data-slot=icon])_input]:pr-9',
  lg: '[&>[data-slot=icon]]:size-5 [&>[data-slot=icon]:first-child]:left-3.5 [&>*+[data-slot=icon]]:right-3.5 [&:has(>[data-slot=icon]:first-child)_input]:pl-12 [&:has(>*+[data-slot=icon])_input]:pr-12',
} satisfies Record<NonNullable<InputGroupProps['size']>, string>;

/**
 * InputGroup wraps an Input with leading/trailing icon slots.
 * Icons should have `data-slot="icon"` attribute for proper positioning.
 *
 * @example
 * ```tsx
 * <InputGroup>
 *   <SearchIcon data-slot="icon" />
 *   <Input placeholder="Search..." />
 * </InputGroup>
 *
 * <InputGroup>
 *   <Input placeholder="Email" />
 *   <MailIcon data-slot="icon" />
 * </InputGroup>
 *
 * <InputGroup>
 *   <LockIcon data-slot="icon" />
 *   <Input type="password" placeholder="Password" />
 *   <EyeIcon data-slot="icon" />
 * </InputGroup>
 * ```
 */
export function InputGroup({
  children,
  className,
  size = 'md',
  ...props
}: Readonly<InputGroupProps>) {
  return (
    <div
      data-slot='control'
      data-component='input-group'
      data-size={size}
      className={cn(
        'relative isolate block w-full',
        sizeClasses[size],
        // Position icons absolutely
        '[&>[data-slot=icon]]:pointer-events-none [&>[data-slot=icon]]:absolute [&>[data-slot=icon]]:top-1/2 [&>[data-slot=icon]]:-translate-y-1/2 [&>[data-slot=icon]]:z-10',
        // Icon colors
        '[&>[data-slot=icon]]:text-tertiary-token',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
