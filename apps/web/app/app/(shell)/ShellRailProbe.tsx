'use client';

import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';

/**
 * Budget falsifier. Imported only by the app shell layout, never by /demo.
 */
export function ShellRailProbe() {
  return (
    <EntitySidebarShell
      isOpen={false}
      ariaLabel='Link Details'
      title='Probe'
      onClose={() => undefined}
      scrollStrategy='shell'
    >
      <span>probe</span>
    </EntitySidebarShell>
  );
}
