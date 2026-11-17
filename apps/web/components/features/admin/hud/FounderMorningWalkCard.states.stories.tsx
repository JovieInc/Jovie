import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderMorningWalkCard } from './FounderMorningWalkCard';

/** Rendered states of the founder walk card beyond its default stories. */
const meta = {
  title: 'Features/Admin/Hud/FounderMorningWalkCard/States',
  component: FounderMorningWalkCard,
  parameters: { layout: 'centered' },
  args: { defaultStatus: 'No walk recorded yet' },
} satisfies Meta<typeof FounderMorningWalkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the compact utility-strip row, with no stored walk to link yet. */
export const PartialCompactNoLastWalk: Story = {
  args: { compact: true },
};

/** Long content: a long status line wraps beside the record action. */
export const LongContentStatus: Story = {
  args: {
    defaultStatus:
      'Last walk was recorded four days ago from the shared studio laptop and is still waiting to be classified by the review queue before anything is admitted',
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
