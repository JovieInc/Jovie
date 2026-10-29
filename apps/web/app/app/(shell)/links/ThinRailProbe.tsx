'use client';

import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';

/**
 * Budget falsifier only. Runtime imports are the entity rail and the
 * registration hook, nothing from the links table.
 */
export function ThinRailProbe() {
  useRegisterRightPanel(
    <EntitySidebarShell
      isOpen={false}
      ariaLabel='Link Details'
      title='Probe'
      onClose={() => undefined}
      scrollStrategy='shell'
      data-testid='links-inspector'
    >
      <span>probe</span>
    </EntitySidebarShell>
  );
  return null;
}
