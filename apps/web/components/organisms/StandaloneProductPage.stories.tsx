import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StandaloneProductPage } from './StandaloneProductPage';

const meta = {
  title: 'Organisms/StandaloneProductPage',
  component: StandaloneProductPage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <div className='rounded-lg border border-subtle bg-surface-0 p-6 text-center text-sm text-secondary-token'>
        Page content
      </div>
    ),
  },
} satisfies Meta<typeof StandaloneProductPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Centered: Story = {
  args: {
    centered: true,
  },
};

export const NarrowWidth: Story = {
  args: {
    width: 'sm',
  },
};

/** Long content: tall content scrolls inside the page instead of clipping. */
export const LongContentScrolls: Story = {
  args: {
    width: 'sm',
    children: (
      <div className='space-y-3'>
        {Array.from({ length: 24 }, (_, i) => `Section ${i + 1}`).map(
          section => (
            <div
              key={section}
              className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'
            >
              {section}
            </div>
          )
        )}
      </div>
    ),
  },
};

/** RTL: the page shell follows a right-to-left document. */
export const RtlCentered: Story = {
  args: {
    centered: true,
    children: (
      <div className='rounded-lg border border-subtle bg-surface-0 p-6 text-sm text-secondary-token'>
        المطالبة بملفك الشخصي
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
