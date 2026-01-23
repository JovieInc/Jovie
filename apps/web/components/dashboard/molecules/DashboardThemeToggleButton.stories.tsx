import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { DashboardThemeToggleButton } from './DashboardThemeToggleButton';

const meta: Meta<typeof DashboardThemeToggleButton> = {
  title: 'Dashboard/Molecules/DashboardThemeToggleButton',
  component: DashboardThemeToggleButton,
  parameters: {
    layout: 'padded',
  },
  args: {
    theme: 'light',
  },
  argTypes: {
    theme: {
      control: { type: 'select' },
      options: ['light', 'dark'],
    },
    onThemeChange: { action: 'theme-change' },
  },
};

export default meta;

type Story = StoryObj<typeof DashboardThemeToggleButton>;

function ControlledStory(
  args: React.ComponentProps<typeof DashboardThemeToggleButton>
) {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(
    args.theme ?? 'light'
  );

  return (
    <DashboardThemeToggleButton
      {...args}
      theme={theme}
      onThemeChange={next => {
        setTheme(next);
        args.onThemeChange?.(next);
      }}
    />
  );
}

export const Controlled: Story = {
  render: args => <ControlledStory {...args} />,
};

export const Light: Story = {
  args: {
    theme: 'light',
  },
};

export const Dark: Story = {
  args: {
    theme: 'dark',
  },
};
