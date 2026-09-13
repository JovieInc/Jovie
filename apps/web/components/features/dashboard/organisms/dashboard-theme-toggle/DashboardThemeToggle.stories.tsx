import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const meta = {
  title: 'Dashboard/Theme/DashboardThemeToggle',
  component: DashboardThemeToggle,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onThemeSave'],
    },
  },
} satisfies Meta<typeof DashboardThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex min-h-11 items-center gap-3'>
      <DashboardThemeToggle onThemeChange={() => {}} />
    </div>
  ),
};

export const Compact: Story = {
  render: () => (
    <div className='flex min-h-11 items-center gap-3'>
      <DashboardThemeToggle variant='compact' onThemeChange={() => {}} />
    </div>
  ),
};

export const WithSystemOption: Story = {
  render: () => (
    <div className='flex min-h-11 items-center gap-3'>
      <DashboardThemeToggle showSystemOption onThemeChange={() => {}} />
    </div>
  ),
};
