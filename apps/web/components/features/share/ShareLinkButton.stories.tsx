import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShareLinkButton } from './ShareLinkButton';

const meta = {
  title: 'Features/Share/ShareLinkButton',
  component: ShareLinkButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Tim White',
    getUrl: () => 'https://jov.ie/tim',
    ariaLabel: 'Share Tim White\x27s profile',
  },
} satisfies Meta<typeof ShareLinkButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Surface: Story = {
  args: {
    variant: 'surface',
  },
};

/** No profile-specific label from the host: the accessible name falls back to "Share". */
export const PartialDefaultLabel: Story = {
  args: {
    ariaLabel: undefined,
  },
};

/**
 * A very long artist name: it goes to the share sheet and the accessible
 * name, while the 44px icon target never grows.
 */
export const LongContentArtistName: Story = {
  args: {
    title:
      'Maximilian Alexander Featherstonehaugh-Wolfeschlegelsteinhausen and the Midnight Static Orchestra',
    getUrl: () =>
      'https://jov.ie/maximilian-alexander-featherstonehaugh-wolfeschlegelsteinhausen',
    ariaLabel:
      'Share Maximilian Alexander Featherstonehaugh-Wolfeschlegelsteinhausen and the Midnight Static Orchestra\x27s profile',
  },
  render: args => (
    <div className='flex w-60 items-center gap-2'>
      <span className='min-w-0 flex-1 truncate text-sm text-primary-token'>
        {args.title}
      </span>
      <ShareLinkButton {...args} />
    </div>
  ),
};

/** Arabic profile name and label in a right-to-left header. */
export const RtlArabic: Story = {
  args: {
    title: 'عمرو دياب',
    getUrl: () => 'https://jov.ie/amrdiab',
    ariaLabel: 'مشاركة الملف الشخصي لعمرو دياب',
  },
  render: args => (
    <div dir='rtl' lang='ar' className='flex w-60 items-center gap-2'>
      <span className='min-w-0 flex-1 truncate text-sm text-primary-token'>
        {args.title}
      </span>
      <ShareLinkButton {...args} />
    </div>
  ),
};
