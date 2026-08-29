import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThemeToggleIcon } from './ThemeToggleIcon';

const meta = {
  title: 'Site/ThemeToggle/ThemeToggleIcon',
  component: ThemeToggleIcon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Icon selection for system, light, and dark theme states. The rendered icon stays decorative while its owning button provides the accessible name.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeToggleIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const System: Story = {
  args: {
    theme: 'system',
    resolvedTheme: 'dark',
  },
};

export const Light: Story = {
  args: {
    theme: 'light',
    resolvedTheme: 'light',
  },
};

export const Dark: Story = {
  args: {
    theme: 'dark',
    resolvedTheme: 'dark',
  },
};
