import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceEngagementBars } from './AudienceEngagementBars';

/** State coverage for the five-bar engagement meter. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceEngagementBars States',
  component: AudienceEngagementBars,
  parameters: { layout: 'centered' },
  args: { score: 60 },
} satisfies Meta<typeof AudienceEngagementBars>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the meter inside an RTL document. */
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
