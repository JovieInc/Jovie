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

/**
 * Long content: the provider renders long composer copy untouched; wrapping
 * belongs to the children it hosts.
 */
export const LongContentChildren: Story = {
  args: {
    children: (
      <div className='w-80 rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        Tell Jovie about the release you are planning, the cities where fans are
        growing, the merch you want to drop with it and anything else you want
        on your profile before launch day.
      </div>
    ),
  },
};

/** Right-to-left: an Arabic composer hint inside an RTL shell. */
export const RtlArabicChildren: Story = {
  args: {
    children: (
      <div
        dir='rtl'
        lang='ar'
        className='w-80 rounded-lg border border-subtle p-4 text-sm text-primary-token'
      >
        اكتب رسالتك إلى جوفي حول إصدارك القادم والمدن التي ينمو فيها جمهورك
      </div>
    ),
  },
};
