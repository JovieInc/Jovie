import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';

const meta = {
  title: 'Marketing/HomepagePrimaryAction States',
  component: HomepagePrimaryAction,
  parameters: { layout: 'centered' },
  args: {
    appearance: 'editorial',
    placeholder: 'Search your name',
    submitLabel: 'Find me',
    submitTestId: 'homepage-primary-cta',
  },
} satisfies Meta<typeof HomepagePrimaryAction>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a placeholder and action label past the pill's width. */
export const LongContentPlaceholder: Story = {
  args: {
    placeholder: 'Search your artist name, band name or paste a Spotify link',
    submitLabel: 'Find my profile',
  },
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: Arabic placeholder and action in an Arabic document. */
export const RtlArabic: Story = {
  args: { placeholder: 'ابحث عن اسمك', submitLabel: 'ابحث' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-96 max-w-full'>
        <Story />
      </div>
    ),
  ],
};
