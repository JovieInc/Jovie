import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { FounderDoorProvider } from '@/contexts/FounderDoorContext';
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@/contexts/KeyboardShortcutsContext';
import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

function OpenSheetOnMount() {
  const { open } = useKeyboardShortcuts();
  useEffect(() => {
    open();
  }, [open]);
  return null;
}

function ShortcutsSheetHarness({ isAdmin }: { readonly isAdmin: boolean }) {
  return (
    <DashboardDataContext.Provider value={{ isAdmin } as DashboardData}>
      <FounderDoorProvider>
        <KeyboardShortcutsProvider>
          <OpenSheetOnMount />
          <KeyboardShortcutsSheet />
        </KeyboardShortcutsProvider>
      </FounderDoorProvider>
    </DashboardDataContext.Provider>
  );
}

const meta: Meta<typeof KeyboardShortcutsSheet> = {
  title: 'Organisms/KeyboardShortcutsSheet',
  component: KeyboardShortcutsSheet,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ShortcutsSheetHarness isAdmin={false} />,
};

export const EntitledFounderDoor: Story = {
  render: () => <ShortcutsSheetHarness isAdmin={true} />,
};
