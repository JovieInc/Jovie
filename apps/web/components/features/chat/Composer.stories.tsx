import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ComposerFocusProvider } from './Composer';

const meta = {
  title: 'Features/Chat/Composer',
  component: ComposerFocusProvider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Shell-level context that tracks whether the chat composer is focused, so AuthShell can dim surrounding chrome. Renders its children unchanged; the behavior is only observable through useComposerFocus/useRegisterComposerFocus.',
      },
    },
  },
} satisfies Meta<typeof ComposerFocusProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        Chat composer content
      </div>
    ),
  },
};
