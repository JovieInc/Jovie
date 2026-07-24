import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'UI/Atoms/Separator',
  component: Separator,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Visual or semantic separator built on Radix. Supports horizontal and vertical orientations with proper ARIA semantics.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: { type: 'select' },
      options: ['horizontal', 'vertical'],
      description: 'Separator orientation',
    },
    decorative: {
      control: { type: 'boolean' },
      description:
        'When true, the separator is purely visual and hidden from assistive tech',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className='w-64 space-y-3'>
      <p className='text-sm font-medium'>Jovie</p>
      <Separator />
      <p className='text-xs text-secondary-token'>Smart links for musicians.</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className='flex h-5 items-center gap-3 text-sm'>
      <span>Profile</span>
      <Separator orientation='vertical' />
      <span>Settings</span>
      <Separator orientation='vertical' />
      <span>Billing</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Vertical separators take the full height of their flex or grid container.',
      },
    },
  },
};
