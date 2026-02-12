'use client';

import { usePathname } from 'next/navigation';
import {
  artistSettingsNavigation,
  userSettingsNavigation,
} from '@/components/dashboard/dashboard-nav/config';
import { SettingsMenuGroup } from '@/components/settings/molecules/SettingsMenuGroup';
import { APP_ROUTES } from '@/constants/routes';

interface SettingsMenuProps {
  readonly focusSection?: string;
}

export function SettingsMenu({ focusSection }: SettingsMenuProps) {
  const pathname = usePathname();
  const isOverview = pathname === APP_ROUTES.SETTINGS && !focusSection;

  return (
    <aside className='space-y-4 rounded-xl border border-subtle bg-surface-1 p-3'>
      <div className='border-b border-subtle px-1 pb-3'>
        <h1 className='text-sm font-semibold text-primary-token'>Settings</h1>
        <p className='mt-1 text-xs text-secondary-token'>
          Fast access to account and artist controls.
        </p>
      </div>

      <nav aria-label='Settings sections' className='space-y-4'>
        <SettingsMenuGroup
          label='General'
          activeId={focusSection}
          items={userSettingsNavigation.map(item => ({
            id: item.id,
            href: item.href,
            label: item.name,
            icon: item.icon,
          }))}
        />

        <SettingsMenuGroup
          label='Artist'
          activeId={focusSection}
          items={artistSettingsNavigation.map(item => ({
            id: item.id,
            href: item.href,
            label: item.name,
            icon: item.icon,
          }))}
        />
      </nav>

      {isOverview ? (
        <p className='rounded-lg bg-surface-2 px-3 py-2 text-xs text-secondary-token'>
          Viewing all settings. Choose a section to focus.
        </p>
      ) : null}
    </aside>
  );
}
