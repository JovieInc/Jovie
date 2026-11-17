import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { PopularityCell } from './PopularityCell';

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/PopularityCell States',
  component: PopularityCell,
  parameters: { layout: 'centered' },
  args: { popularity: 72 },
} satisfies Meta<typeof PopularityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the popularity bar inside an RTL document. */
export const RtlPopularity: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Spotify popularity 72 out of 100',
      })
    ).toBeVisible();
  },
};

/** Right-to-left: an unknown score falls back to a dash. */
export const RtlUnknownPopularity: Story = {
  args: { popularity: null },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeVisible();
  },
};
