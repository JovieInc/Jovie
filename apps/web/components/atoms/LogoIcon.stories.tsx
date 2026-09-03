import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoIcon } from './LogoIcon';

const meta = {
  title: 'Atoms/LogoIcon',
  component: LogoIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    size: 48,
    variant: 'color',
  },
} satisfies Meta<typeof LogoIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Muted: Story = {
  args: {
    variant: 'muted',
  },
};

export const White: Story = {
  args: {
    variant: 'white',
  },
  parameters: {
    backgrounds: { default: 'dark' },
    themes: { themeOverride: 'dark' },
  },
  decorators: [
    StoryComponent => (
      <div className='rounded-lg bg-surface-0 p-6'>
        <StoryComponent />
      </div>
    ),
  ],
};

export const Sized: Story = {
  args: {
    size: 72,
  },
};
