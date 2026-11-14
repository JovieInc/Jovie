import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { TableMetaContext, type TableMeta } from '@/contexts/TableMetaContext';
import { DrawerToggleButton } from './DrawerToggleButton';

function DrawerMeta({
  children,
  registered = true,
}: Readonly<{ children: ReactNode; registered?: boolean }>) {
  const [open, setOpen] = useState(false);
  const [tableMeta, setTableMeta] = useState<TableMeta>({ rowCount: 12 });
  const value = useMemo(
    () => ({
      tableMeta: {
        ...tableMeta,
        rightPanelWidth: open ? 320 : 0,
        toggle: registered ? () => setOpen(current => !current) : null,
      },
      setTableMeta,
    }),
    [open, registered, tableMeta]
  );
  return (
    <TableMetaContext.Provider value={value}>{children}</TableMetaContext.Provider>
  );
}

/**
 * State coverage for DrawerToggleButton. The canonical stories use the empty
 * TableMetaProvider; these provide table meta with a working drawer toggle
 * (or none) so the button can be pressed.
 */
const meta = {
  title: 'Dashboard/Atoms/DrawerToggleButton States',
  component: DrawerToggleButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <DrawerMeta>
        <Story />
      </DrawerMeta>
    ),
  ],
} satisfies Meta<typeof DrawerToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the page registered no drawer toggle, so the control is disabled. */
export const PartialNoDrawerRegistered: Story = {
  args: { chrome: 'page-toolbar' },
  decorators: [
    Story => (
      <DrawerMeta registered={false}>
        <Story />
      </DrawerMeta>
    ),
  ],
};

/** Long content: a long label and tooltip on the icon-only toolbar control. */
export const LongContentLabel: Story = {
  args: {
    chrome: 'page-toolbar',
    label: 'Release analytics and audience insights',
    ariaLabel: 'Toggle the release analytics and audience insights sidebar',
  },
};

/** Right-to-left: both chromes inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    chrome: 'page-toolbar',
    label: 'التفاصيل',
    ariaLabel: 'تبديل الشريط الجانبي للتفاصيل',
  },
  decorators: [
    Story => (
      <div dir='rtl' className='flex items-center gap-2'>
        <Story />
      </div>
    ),
  ],
};
