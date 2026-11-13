import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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

/**
 * Long content: a caller's longer skip label. Tab in to check that the
 * revealed pill wraps inside the viewport instead of running off the edge.
 */
export const LongContentLinkText: Story = {
  args: {
    targetId: 'app-main',
    linkText:
      'Skip the navigation and go straight to the main content of this page',
  },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', {
      name: 'Skip the navigation and go straight to the main content of this page',
    });
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await expect(link).toHaveAttribute('href', '#app-main');
  },
};

/** Right-to-left: an Arabic skip label inside an RTL document. */
export const RtlArabicLinkText: Story = {
  args: {
    linkText: 'انتقل إلى المحتوى',
  },
  render: args => (
    <div
      dir='rtl'
      className='relative h-24 w-72 rounded-md border border-subtle bg-surface-0 p-4'
    >
      <SkipToContent {...args} />
      <p className='text-app text-secondary-token'>
        اضغط Tab لإظهار رابط التخطي.
      </p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', {
      name: 'انتقل إلى المحتوى',
    });
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};
