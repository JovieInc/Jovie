import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DrawerSettingsToggle } from './DrawerSettingsToggle';

const meta = {
  title: 'Molecules/Drawer/DrawerSettingsToggle',
  component: DrawerSettingsToggle,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Show on profile',
    ariaLabel: 'Show on profile',
    checked: false,
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof DrawerSettingsToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};

export const Checked: Story = {
  args: {
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const CompactDensity: Story = {
  args: {
    density: 'compact',
  },
};
