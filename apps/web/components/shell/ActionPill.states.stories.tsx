import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { Plus } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActionPill } from './ActionPill';

const header: Decorator = function ShellHeader(Story) {
  return (
    <div className='w-64 bg-base p-4'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='bg-base p-4'>
      <Story />
    </div>
  );
};

/** State coverage for the header CTA pill; Default, WithIcon and Submit live in ActionPill.stories.tsx. */
const meta = {
  title: 'Shell/ActionPill States',
  component: ActionPill,
  parameters: { layout: 'centered' },
  decorators: [header],
  args: { label: 'New release', onClick: fn() },
} satisfies Meta<typeof ActionPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only a label, with no icon and no click handler. */
export const PartialLabelOnly: Story = {
  args: { onClick: undefined },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'New release',
    });
    await expect(button).toHaveAttribute('type', 'button');
    await expect(button.querySelector('svg')).toBeNull();
  },
};

/** Long content: a long label beside the leading icon in a narrow header. */
export const LongContentLabel: Story = {
  args: {
    icon: Plus,
    label: 'Schedule a new release for every connected storefront',
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

/** Right-to-left: an Arabic label with its icon in an RTL header. */
export const RtlArabic: Story = {
  args: { icon: Plus, label: 'إصدار جديد' },
  decorators: [rtl],
};
