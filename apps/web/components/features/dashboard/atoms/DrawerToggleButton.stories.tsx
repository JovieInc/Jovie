import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { DrawerToggleButton } from './DrawerToggleButton';

const meta = {
  title: 'Dashboard/Atoms/DrawerToggleButton',
  component: DrawerToggleButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <TableMetaProvider>
        <Story />
      </TableMetaProvider>
    ),
  ],
} satisfies Meta<typeof DrawerToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RailChrome: Story = {};

export const PageToolbarChrome: Story = {
  args: {
    chrome: 'page-toolbar',
  },
};

export const CustomLabel: Story = {
  args: {
    chrome: 'page-toolbar',
    label: 'Insights',
    ariaLabel: 'Toggle insights sidebar',
  },
};
