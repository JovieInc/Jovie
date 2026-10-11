import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AskJovieMark } from './AskJovie';

const meta = {
  title: 'AskJovie/AskJovieMark',
  component: AskJovieMark,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Global "Ask Jovie" entry point. Resting state is a faded mark; hover/focus spins the mark once and slides the wordmark out. Click opens the contextual chat popover.',
      },
    },
    jovie: {
      // pathname is internal (from usePathname) and disabled lives on the
      // popover's inner submit control, not on AskJovieMark's props.
      uncoveredProps: ['pathname', 'disabled'],
    },
  },
  decorators: [
    Story => (
      <div className='flex items-center gap-4 bg-surface-1 p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AskJovieMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
