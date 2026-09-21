import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const meta = {
  title: 'Dashboard/Theme/DashboardThemeToggle',
  component: DashboardThemeToggle,
  parameters: {
    layout: 'centered',
    jovie: {
      // theme, resolvedTheme, isDark, and onToggle are fields of the file's
      // internal ThemeOptionGridProps/ThemeToggleButtonProps helper
      // interfaces, not passable DashboardThemeToggle props. The exported
      // onThemeChange, onThemeSave, and variant props are exercised below;
      // Updating drives the hook's isUpdating state and asserts its rendered
      // disabled state instead of allowlisting either observable state.
      uncoveredProps: ['theme', 'resolvedTheme', 'isDark', 'onToggle'],
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

export const Updating: Story = {
  render: () => (
    <div className='flex min-h-11 items-center gap-3'>
      <DashboardThemeToggle
        onThemeChange={() => {}}
        onThemeSave={() => new Promise<void>(() => {})}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', {
      name: /Switch to (dark|light) mode/,
    });

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
    await expect(toggle).toHaveAccessibleName('Updating theme...');
  },
};
