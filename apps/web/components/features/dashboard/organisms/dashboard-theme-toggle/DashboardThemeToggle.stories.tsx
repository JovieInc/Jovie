import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const meta = {
  title: 'Dashboard/Theme/DashboardThemeToggle',
  component: DashboardThemeToggle,
  parameters: {
    layout: 'centered',
    jovie: {
      // onThemeSave is optional at the surface; the remaining names are fields
      // of the file's internal ThemeOptionGridProps/ThemeToggleButtonProps
      // helper interfaces and hook-derived state, not passable props — the
      // toggle, compact, and system-option stories already exercise every
      // externally controllable prop.
      uncoveredProps: [
        'onThemeSave',
        'onThemeChange',
        'variant',
        'theme',
        'resolvedTheme',
        'isUpdating',
        'isDark',
        'onToggle',
        'disabled',
      ],
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
