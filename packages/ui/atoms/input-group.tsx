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
  sm: {
    iconLeft: 'left-2',
    iconRight: 'right-2',
    iconSize: 'size-4',
    inputPaddingLeft: '[&_input]:pl-8',
    inputPaddingRight: '[&_input]:pr-8',
  },
  md: {
    iconLeft: 'left-3',
    iconRight: 'right-3',
    iconSize: 'size-4',
    inputPaddingLeft: '[&_input]:pl-10',
    inputPaddingRight: '[&_input]:pr-10',
  },
  lg: {
    iconLeft: 'left-3.5',
    iconRight: 'right-3.5',
    iconSize: 'size-5',
    inputPaddingLeft: '[&_input]:pl-12',
    inputPaddingRight: '[&_input]:pr-12',
  },
};

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
}: InputGroupProps) {
  const sizeConfig = sizeClasses[size];

  return (
    <div
      data-slot='control'
      className={cn(
        'relative isolate block w-full',
        // Adjust input padding based on icon positions
        `[&_[data-slot=icon]:first-child~input]:pl-10 [&_input:has(~[data-slot=icon]:last-child)]:pr-10`,
        `[&>[data-slot=icon]:first-child]~[&_input]:${sizeConfig.inputPaddingLeft}`,
        // Position icons absolutely
        '[&>[data-slot=icon]]:pointer-events-none [&>[data-slot=icon]]:absolute [&>[data-slot=icon]]:top-1/2 [&>[data-slot=icon]]:-translate-y-1/2 [&>[data-slot=icon]]:z-10',
        // Icon sizes
        `[&>[data-slot=icon]]:${sizeConfig.iconSize}`,
        // Icon positions - first child on left, last child on right
        `[&>[data-slot=icon]:first-child]:${sizeConfig.iconLeft}`,
        `[&>[data-slot=icon]:last-child]:${sizeConfig.iconRight}`,
        // When there's only one icon child after input, position it on the right
        `[&>input+[data-slot=icon]]:${sizeConfig.iconRight}`,
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
