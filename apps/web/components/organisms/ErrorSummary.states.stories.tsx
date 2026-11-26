import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ErrorSummary } from './ErrorSummary';

const meta = {
  title: 'Organisms/ErrorSummary/States',
  component: ErrorSummary,
  parameters: { layout: 'centered' },
  decorators: [
    function WidthFrame(Story) {
      return (
        <div className='w-full max-w-96'>
          <Story />
        </div>
      );
    },
  ],
  args: { errors: {} },
} satisfies Meta<typeof ErrorSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no errors, so the summary renders nothing. */
export const Empty: Story = {};

/** Error: a single failing field read as plain text, not a link. */
export const Error: Story = {
  args: { errors: { name: 'Artist name is required' } },
};

/** Partial: some fields are links the person can jump to. */
export const Partial: Story = {
  args: {
    errors: { name: 'Artist name is required', handle: 'Handle is taken' },
    onFocusField: () => undefined,
  },
};

/** LongContent: long messages wrap inside the summary. */
export const LongContent: Story = {
  args: {
    errors: {
      tagline:
        'Tagline must be less than 160 characters, so shorten it to a single sentence that still says who you are and what you release',
    },
    onFocusField: () => undefined,
  },
};

/** PermissionDenied: a server refusal surfaces as a field error. */
export const PermissionDenied: Story = {
  args: { errors: { form: 'You do not have permission to edit this profile' } },
};

/** Rtl: the list mirrors for a right-to-left locale. */
export const Rtl: Story = {
  args: { errors: { name: 'اسم الفنان مطلوب' }, onFocusField: () => undefined },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
