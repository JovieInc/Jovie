import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { ThemeToggleSegmented } from './ThemeToggleSegmented';
import type { ThemeValue } from './types';

const meta = {
  title: 'Site/ThemeToggle/ThemeToggleSegmented',
  component: ThemeToggleSegmented,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Three-way theme selector with a tokenized indicator, semantic labels, and a stable 28px control geometry.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeToggleSegmented>;

export default meta;
type Story = StoryObj<typeof meta>;

const THEME_ORDER: readonly ThemeValue[] = ['system', 'light', 'dark'];
const THEME_SEGMENT_WIDTH_PX = 28;

function ControlledSegmented({
  variant = 'default',
}: Readonly<{ variant?: 'default' | 'linear' }>) {
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>('system');
  const indicatorX = THEME_ORDER.indexOf(currentTheme) * THEME_SEGMENT_WIDTH_PX;

  return (
    <ThemeToggleSegmented
      currentTheme={currentTheme}
      indicatorX={indicatorX}
      setTheme={setTheme => setCurrentTheme(setTheme)}
      shortcutDescriptionId='storybook-theme-shortcut'
      shortcutDescription='Press T to toggle between light and dark themes.'
      variant={variant}
      wrapButton={button => button}
    />
  );
}

export const Controlled: Story = {
  render: () => <ControlledSegmented />,
};

export const Linear: Story = {
  render: () => <ControlledSegmented variant='linear' />,
};
