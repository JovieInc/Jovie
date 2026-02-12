'use client';

import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface SettingsMenuItemProps {
  readonly href: string;
  readonly label: string;
  readonly icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  readonly active?: boolean;
}

export function SettingsMenuItem({
  href,
  label,
  icon: Icon,
  active = false,
}: SettingsMenuItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-surface-2 text-primary-token'
          : 'text-secondary-token hover:bg-surface-2/80 hover:text-primary-token'
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active
            ? 'text-primary-token'
            : 'text-tertiary-token group-hover:text-primary-token'
        )}
      />
      <span className='truncate'>{label}</span>
    </Link>
  );
}
