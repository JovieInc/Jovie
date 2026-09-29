import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DrawerSection } from './DrawerSection';

const meta = {
  title: 'Molecules/Drawer/DrawerSection',
  component: DrawerSection,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Metadata',
    children: (
      <p className='text-sm text-secondary-token'>Section content goes here.</p>
    ),
  },
} satisfies Meta<typeof DrawerSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const Card: Story = {
  args: {
    surface: 'card',
  },
};

export const Collapsed: Story = {
  args: {
    defaultOpen: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Metadata' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

export const NotCollapsible: Story = {
  args: {
    collapsible: false,
  },
};

export const WithActions: Story = {
  args: {
    actions: (
      <button
        type='button'
        className='text-2xs text-secondary-token hover:text-primary-token'
      >
        Edit
      </button>
    ),
  },
};
