import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { CreatorProfileSocialLinks } from './CreatorProfileSocialLinks';

/** State coverage for the social-links cell of the admin creator profiles table. */
const meta = {
  title: 'Features/Admin/CreatorProfileSocialLinks',
  component: CreatorProfileSocialLinks,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreatorProfileSocialLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

const link = (
  id: string,
  platform: string,
  url: string,
  displayText: string | null = null
) => ({ id, platform, platformType: 'social', url, displayText });

/** Empty: a creator with no social links shows a quiet dash. */
export const EmptyNoLinks: Story = {
  args: { socialLinks: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeVisible();
  },
};

/** Long content: many links with long handles collapse to three pills and a count. */
export const LongContentManyLinks: Story = {
  args: {
    socialLinks: [
      link(
        'ig',
        'instagram',
        'https://instagram.com/an.artist.with.a.really.long.handle.name'
      ),
      link('tt', 'tiktok', 'https://tiktok.com/@another_very_long_handle_name'),
      link('yt', 'youtube', 'https://youtube.com/@yetanotherlongchannelname'),
      link('x', 'x', 'https://x.com/long_handle_for_x'),
      link('sc', 'soundcloud', 'https://soundcloud.com/long-soundcloud-name'),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('button')).toHaveLength(3);
    await expect(canvas.getByText('5')).toBeVisible();
  },
};

/** Right-to-left: the link rail inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: {
    socialLinks: [
      link('ig', 'instagram', 'https://instagram.com/artist', 'فنان'),
      link('tt', 'tiktok', 'https://tiktok.com/@artist'),
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(2);
  },
};
