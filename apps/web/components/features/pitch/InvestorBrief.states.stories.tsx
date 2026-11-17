import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvestorBrief } from './InvestorBrief';

/** Rendered states of the gated investor brief body. */
const meta = {
  title: 'Investor/Routes/InvestorPortalLanding/States',
  component: InvestorBrief,
  parameters: { layout: 'fullscreen' },
  args: { investorName: null },
} satisfies Meta<typeof InvestorBrief>;

export default meta;
type Story = StoryObj<typeof meta>;

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** Long content: a long recorded investor name above the thesis. */
export const LongContentInvestorName: Story = {
  args: {
    investorName:
      'The Independent Music and Creative Technology Fund, Seed and Pre-Seed Partners',
  },
};

/** Right-to-left: an Arabic investor name in an Arabic document direction. */
export const RtlArabicInvestor: Story = {
  args: { investorName: 'صندوق الموسيقى المستقلة' },
  decorators: [withRtlDocument],
};
