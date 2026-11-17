import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AudienceSourceCell } from './AudienceSourceCell';

/** State coverage for the traffic source icon cell. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceSourceCell States',
  component: AudienceSourceCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    referrerHistory: [{ url: 'https://instagram.com/', timestamp: '' }],
  },
} satisfies Meta<typeof AudienceSourceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no referrer, UTM or action source reads as Direct. */
export const EmptyHistory: Story = {
  args: {
    referrerHistory: [],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'Direct' })
    ).toBeVisible();
  },
};

/** Error: an unparseable referrer URL is shown as recorded. */
export const ErrorUnparseableReferrer: Story = {
  args: {
    referrerHistory: [{ url: 'not a url' }],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'not a url' })
    ).toBeVisible();
  },
};

/** Partial: a UTM source with no medium shows the source alone. */
export const PartialUtmSourceOnly: Story = {
  args: {
    referrerHistory: [],
    utmParams: { source: 'tiktok.com' },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'TikTok' })
    ).toBeVisible();
  },
};

/** Long content: a long unknown host is named in full. */
export const LongContentHost: Story = {
  args: {
    referrerHistory: [
      {
        url: 'https://newsletter.independent-music-weekly-roundup.example.com/issue/42',
      },
    ],
  },
};

/** Right-to-left: the source icon inside an RTL document. */
export const RtlSource: Story = {
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
