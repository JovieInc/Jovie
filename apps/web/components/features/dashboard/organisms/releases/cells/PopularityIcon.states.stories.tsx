import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PopularityIcon } from './PopularityIcon';

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/PopularityIcon/States',
  component: PopularityIcon,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PopularityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no popularity score yet, so a dash shows instead of bars. */
export const EmptyNoScore: Story = { args: { popularity: undefined } };

/** Long content: a score above the range clamps to the full three bars. */
export const LongContentOverRange: Story = { args: { popularity: 4200 } };

/** Rtl: the bars inside a right-to-left container. */
export const RtlBars: Story = {
  args: { popularity: 50 },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
