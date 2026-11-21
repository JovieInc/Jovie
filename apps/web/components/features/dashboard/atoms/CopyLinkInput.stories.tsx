import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyLinkInput } from './CopyLinkInput';

const meta = {
  title: 'Dashboard/Atoms/CopyLinkInput',
  component: CopyLinkInput,
  parameters: {
    layout: 'centered',
  },
  args: {
    url: 'https://jov.ie/tim',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
  render: args => (
    <div className='w-72'>
      <CopyLinkInput {...args} />
    </div>
  ),
} satisfies Meta<typeof CopyLinkInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: 'sm' },
};

export const WithDisplayValue: Story = {
  args: {
    url: 'https://jov.ie/tim?utm_source=share',
    displayValue: 'jov.ie/tim',
  },
};

/** Empty: no URL to show yet, the field is blank and copy writes an empty string. */
export const EmptyUrl: Story = {
  args: { url: '' },
};

/** Error: a failed clipboard write leaves the copy button in its idle state. */
export const ErrorClipboardBlocked: Story = {
  args: { url: 'https://jov.ie/tim', size: 'sm' },
};

/** Partial: only the required url, with a shorter display value. */
export const PartialDisplayValue: Story = {
  args: {
    url: 'https://jov.ie/tim?utm_source=share',
    displayValue: 'jov.ie/tim',
  },
};

/** Long content: a long URL truncates inside the field. */
export const LongContentUrl: Story = {
  args: {
    url: 'https://jov.ie/an-artist-with-a-very-long-handle/releases/a-release-with-a-very-long-title-and-tracking-parameters?utm_source=share&utm_medium=copy',
  },
};

/** RTL: the copy button sits at the inline end in a right-to-left document. */
export const RtlUrl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
