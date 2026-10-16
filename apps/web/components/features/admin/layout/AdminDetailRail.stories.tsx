import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { AdminDetailRail } from './AdminDetailRail';

const meta = {
  title: 'Features/Admin/Layout/AdminDetailRail',
  component: AdminDetailRail,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    ariaLabel: 'Customer details',
    headerMode: 'minimal',
    scrollStrategy: 'shell',
    onClose: () => undefined,
    entityHeader: <h2 className='px-3 py-2 text-sm'>Customer</h2>,
    footer: (
      <button type='button' className='text-sm'>
        Save
      </button>
    ),
    children: (
      <DrawerSection title='Evidence'>
        <p>Observed evidence</p>
      </DrawerSection>
    ),
  },
} satisfies Meta<typeof AdminDetailRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Empty: Story = {
  args: {
    isEmpty: true,
    emptyMessage: 'Select a customer to inspect it.',
    entityHeader: undefined,
    footer: undefined,
    children: null,
  },
};
