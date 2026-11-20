import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import {
  DashboardDataContext,
  type DashboardDataContextValue,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
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

// The sheet portals to document.body, so play functions query the body.
const body = () => within(document.body);

async function search(query: string) {
  const field = await body().findByPlaceholderText('Search shortcuts');
  await userEvent.click(field);
  await userEvent.paste(query);
  return field;
}

/** No shortcut matches the search: the sheet offers Clear Search. */
export const EmptySearchResults: Story = {
  render: () => <ShortcutsSheetHarness isAdmin={false} />,
  play: async () => {
    await search('zzzz-no-such-shortcut');
    await expect(
      await body().findByText(/No shortcuts found/)
    ).toBeInTheDocument();
  },
};

const LONG_QUERY =
  'a very long search for a shortcut that opens the release planner and schedules every pre-save';

/** A long query wraps inside the no-results message without widening the sheet. */
export const LongContentSearchQuery: Story = {
  render: () => <ShortcutsSheetHarness isAdmin={false} />,
  play: async () => {
    const field = await search(LONG_QUERY);
    await expect(field).toHaveValue(LONG_QUERY);
  },
};

function RtlDocument({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <>{children}</>;
}

/** Right to left: the portalled sheet follows the document direction. */
export const RtlArabicSearch: Story = {
  render: () => (
    <RtlDocument>
      <ShortcutsSheetHarness isAdmin={false} />
    </RtlDocument>
  ),
  play: async () => {
    await search('اختصار');
  },
};
