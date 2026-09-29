import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MoonIcon, SunIcon } from './ThemeIcons';

const meta = {
  title: 'Dashboard/Organisms/DashboardThemeToggle/ThemeIcons',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof MoonIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sun: Story = {
  render: () => <SunIcon className='h-5 w-5 text-secondary-token' />,
};

export const Moon: Story = {
  render: () => <MoonIcon className='h-5 w-5 text-secondary-token' />,
};

export const Both: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <SunIcon className='h-5 w-5 text-secondary-token' />
      <MoonIcon className='h-5 w-5 text-secondary-token' />
    </div>
  ),
};
