import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyableField } from './CopyableField';

const meta = {
  title: 'Features/Ui/CopyableField',
  component: CopyableField,
  parameters: {
    layout: 'centered',
  },
  args: {
    value: 'tim@jovie.com',
    label: 'Email',
  },
} satisfies Meta<typeof CopyableField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomContent: Story = {
  args: {
    value: 'USQX52000123',
    label: 'ISRC',
    children: <code>USQX52000123</code>,
  },
};

/** Empty: a field with no value renders only the copy affordance. */
export const EmptyValue: Story = { args: { value: '', label: 'Email' } };

/** Partial: custom content that differs from the copied value. */
export const PartialCustomContent: Story = {
  args: { value: 'https://jov.ie/tim', label: 'Link', children: 'jov.ie/tim' },
};

/** Long content: a long value breaks across lines instead of overflowing. */
export const LongContentBreaks: Story = {
  args: {
    value:
      'https://open.spotify.com/artist/0000000000000000000000?si=a-very-long-tracking-parameter-value',
    label: 'Spotify link',
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-56'>
          <Story />
        </div>
      );
    },
  ],
};

/** Error: the clipboard rejects, so the field reports a failed copy. */
export const ErrorCopyFailed: Story = {
  play: async ({ canvasElement }) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    const button = canvasElement.querySelector('button');
    button?.click();
  },
};

/** Rtl: the copy icon sits at the inline end in a right-to-left layout. */
export const RtlValue: Story = {
  args: { value: 'بريد@مثال.com', label: 'Email' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
