import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkipToContent } from './SkipToContent';

/**
 * `SkipToContent` is visually hidden until it receives keyboard focus
 * (`sr-only` → `focus:not-sr-only`). Tab into the canvas to see it appear.
 */
const meta = {
  title: 'Atoms/SkipToContent',
  component: SkipToContent,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='relative h-24 w-72 rounded-md border border-subtle bg-surface-0 p-4'>
      <SkipToContent {...args} />
      <p className='text-app text-secondary-token'>
        Press Tab to reveal the skip link.
      </p>
    </div>
  ),
} satisfies Meta<typeof SkipToContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomText: Story = {
  args: {
    targetId: 'app-main',
    linkText: 'Skip to main content',
  },
};
