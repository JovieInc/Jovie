import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { FounderDoorProvider } from '@/contexts/FounderDoorContext';
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@/contexts/KeyboardShortcutsContext';
import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

function OpenOnMount() {
  const { open } = useKeyboardShortcuts();
  useEffect(() => {
    open();
  }, [open]);
  return null;
}

function renderSheet(isAdmin: boolean) {
  return render(
    <DashboardDataContext.Provider value={{ isAdmin } as DashboardData}>
      <FounderDoorProvider>
        <KeyboardShortcutsProvider>
          <OpenOnMount />
          <KeyboardShortcutsSheet />
        </KeyboardShortcutsProvider>
      </FounderDoorProvider>
    </DashboardDataContext.Provider>
  );
}

describe('KeyboardShortcutsSheet', () => {
  it('lists Toggle Ovie / Jovie for entitled users only', () => {
    const entitled = renderSheet(true);
    expect(entitled.getByText('Toggle Ovie / Jovie')).toBeInTheDocument();
    entitled.unmount();

    renderSheet(false);
    expect(screen.queryByText('Toggle Ovie / Jovie')).not.toBeInTheDocument();
    expect(screen.getByText('Open command menu')).toBeInTheDocument();
  });
});
