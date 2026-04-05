import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoIcon } from './LogoIcon';

const meta: Meta<typeof LogoIcon> = {
  title: 'Atoms/LogoIcon',
  component: LogoIcon,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    size: {
      control: { type: 'range', min: 16, max: 128, step: 8 },
    },
    variant: {
      control: 'radio',
      options: ['color', 'white'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof LogoIcon>;

export const Default: Story = {
  args: {
    size: 48,
    variant: 'color',
  },
};

export const Small: Story = {
  args: {
    size: 24,
    variant: 'color',
  },
};

export const Large: Story = {
  args: {
    size: 96,
    variant: 'color',
  },
};

export const White: Story = {
  args: {
    size: 48,
    variant: 'white',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-end gap-4'>
      <LogoIcon size={16} />
      <LogoIcon size={24} />
      <LogoIcon size={32} />
      <LogoIcon size={48} />
      <LogoIcon size={64} />
      <LogoIcon size={96} />
    </div>
  ),
};
