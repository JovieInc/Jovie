import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TimActionRequiredSection } from './TimActionRequiredSection';

const meta = {
  title: 'Features/Admin/TimActionRequiredSection',
  component: TimActionRequiredSection,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'issue',
        'onClose',
        'isClosing',
        'disabled',
        'isLoading',
      ],
    },
  },
  decorators: [
    Story => (
      <div className='w-[34rem] bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimActionRequiredSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
