'use client';

import * as React from 'react';
import { SettingsMenuItem } from '@/components/settings/atoms/SettingsMenuItem';

export interface SettingsMenuGroupItem {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

interface SettingsMenuGroupProps {
  readonly label: string;
  readonly items: readonly SettingsMenuGroupItem[];
  readonly activeId?: string;
}

export function SettingsMenuGroup({
  label,
  items,
  activeId,
}: SettingsMenuGroupProps) {
  return (
    <section className='space-y-2'>
      <h2 className='px-3 text-xs font-medium uppercase tracking-wide text-tertiary-token'>
        {label}
      </h2>
      <div className='space-y-1'>
        {items.map(item => (
          <SettingsMenuItem
            key={item.id}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={item.id === activeId}
          />
        ))}
      </div>
    </section>
  );
}
