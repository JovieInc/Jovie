'use client';

import { ArrowLeft } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { DrawerButton } from './DrawerButton';

export interface DrawerBackButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly label: string;
}

export function DrawerBackButton({
  label,
  className,
  ...props
}: DrawerBackButtonProps) {
  return (
    <DrawerButton tone='ghost' className={className} {...props}>
      <ArrowLeft className='h-3.5 w-3.5' aria-hidden='true' />
      <span className='max-w-[200px] truncate'>{label}</span>
    </DrawerButton>
  );
}
