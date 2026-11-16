import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { SocialLinksCell } from './SocialLinksCell';

/** State coverage for the social links rail cell. */
const meta = {
  title: 'Organisms/Table/Molecules/SocialLinksCell States',
  component: SocialLinksCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    function CellWidth(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    links: [
      { id: 'l1', url: 'https://instagram.com/jovie', platform: 'instagram' },
    ],
  },
} satisfies Meta<typeof SocialLinksCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: links missing platform and display text still render pills. */
export const PartialMissingPlatform: Story = {
  args: {
    links: [
      { id: 'l1', url: 'https://example.com/press-kit', platform: null },
      { id: 'l2', url: 'https://instagram.com/jovie', displayText: null },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('button').length
    ).toBeGreaterThan(0);
  },
};

/** Long content: more links than fit, with long handles, behind a count. */
export const LongContentManyLinks: Story = {
  args: {
    maxLinks: 3,
    links: [
      {
        id: 'l1',
        url: 'https://instagram.com/the_extremely_long_artist_handle_official',
        platform: 'instagram',
      },
      {
        id: 'l2',
        url: 'https://tiktok.com/@another_really_long_handle_for_tiktok',
        platform: 'tiktok',
      },
      { id: 'l3', url: 'https://x.com/longhandle_on_x_dot_com', platform: 'x' },
      { id: 'l4', url: 'https://youtube.com/@jovie', platform: 'youtube' },
      { id: 'l5', url: 'https://facebook.com/jovie', platform: 'facebook' },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTitle('5 social links')
    ).toBeVisible();
  },
};

/** Right-to-left: the link rail inside an RTL document. */
export const RtlLinks: Story = {
  args: {
    links: [
      { id: 'l1', url: 'https://instagram.com/jovie', platform: 'instagram' },
      { id: 'l2', url: 'https://tiktok.com/@jovie', platform: 'tiktok' },
    ],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};
