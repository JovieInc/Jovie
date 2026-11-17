import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TitleMenuTrigger } from './title-menu-trigger';

const meta: Meta<typeof TitleMenuTrigger> = {
  title: 'UI/Atoms/TitleMenuTrigger',
  component: TitleMenuTrigger,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { label: 'Tour Budget For The Fall Run' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MenuOpen: Story = {
  args: { 'aria-expanded': true, 'data-state': 'open' } as Story['args'],
};

/** A long title truncates inside a narrow header instead of pushing it. */
export const LongContent: Story = {
  args: {
    label:
      'Setlist, Merch And Travel Budget For The Brooklyn, Philly And Boston Run',
  },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
};

export const RtlOverflow: Story = {
  args: { label: 'خطة إصدار الربيع وميزانية الجولة الطويلة جدا' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-56'>
        <Story />
      </div>
    ),
  ],
};

export const Disabled: Story = {
  args: { disabled: true },
};
