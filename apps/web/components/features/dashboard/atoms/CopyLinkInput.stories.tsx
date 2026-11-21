import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
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

export const EmptyUrl: Story = {
  args: { url: '', displayValue: '' },
};

export const LongContentUrl: Story = {
  args: {
    url: 'https://jov.ie/the-extraordinarily-long-named-midnight-orchestra?utm_source=share&utm_medium=social&utm_campaign=release-day',
  },
};

export const RtlUrl: Story = {
  args: {
    url: 'https://jov.ie/ar',
    displayValue: 'jov.ie/فرقة-منتصف-الليل',
  },
};

export const OfflineCopyFails: Story = {
  decorators: [
    Story => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('Offline')) },
      });
      return <Story />;
    },
  ],
};

export const PartialUrlOnly: Story = {
  args: { size: 'md', displayValue: undefined, stopPropagation: false },
};

export const ErrorClipboardDenied: Story = {
  decorators: [
    Story => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            Promise.reject(new DOMException('Denied', 'NotAllowedError')),
        },
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Copy to clipboard' })
    );
  },
};
