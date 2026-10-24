import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import {
  DashboardDataContext,
  type DashboardDataContextValue,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { FounderDoorProvider } from '@/contexts/FounderDoorContext';
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@/contexts/KeyboardShortcutsContext';
import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

function OpenSheetOnMount() {
  const { open } = useKeyboardShortcuts();
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    open();
  }, [open]);
  useEffect(() => {
    // The real sheet portals to body; certify that dialog and its focus trap.
    const marked = new Map<HTMLElement, string[]>();
    const set = (node: HTMLElement, attributes: Record<string, string>) => {
      for (const [key, value] of Object.entries(attributes))
        node.setAttribute(key, value);
      marked.set(node, Object.keys(attributes));
    };
    const mark = () => {
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][data-slot="sheet-content"]'
      );
      if (!dialog) return;
      set(document.body, {
        'data-jovie-eval-family': 'KeyboardShortcutsSheet',
        'data-jovie-eval-owner': 'KeyboardShortcutsSheet',
        'data-jovie-eval-theme': resolvedTheme ?? '',
        'data-jovie-eval-surface-token': '--color-bg-base',
        'data-jovie-eval-mapping': JSON.stringify({ sheet: 'neutral' }),
      });
      set(dialog, {
        'data-jovie-eval-variant': 'sheet',
        'data-jovie-eval-target': 'true',
        'data-jovie-eval-tone': 'neutral',
        'data-jovie-eval-padding-x': '--space-0',
        'data-jovie-eval-padding-y': '--space-0',
        'data-jovie-eval-radius': '--radius-lg',
        'data-jovie-eval-interactive': 'true',
        'data-jovie-eval-keyboard-target-selector':
          'button[aria-label="Close"]',
      });
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const [node, attributes] of marked)
        for (const attribute of attributes) node.removeAttribute(attribute);
    };
  }, [resolvedTheme]);
  return (
    <Button variant='ghost' onClick={open}>
      Open keyboard shortcuts
    </Button>
  );
}

function ShortcutsSheetHarness({ isAdmin }: { readonly isAdmin: boolean }) {
  return (
    <DashboardDataContext.Provider
      value={
        {
          isAdmin,
          identities: [],
          activeIdentity: null,
        } as unknown as DashboardDataContextValue
      }
    >
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

export const OvieNavigation: Story = {
  render: () => <ShortcutsSheetHarness isAdmin={true} />,
  parameters: { nextjs: { navigation: { pathname: APP_ROUTES.OV } } },
};
