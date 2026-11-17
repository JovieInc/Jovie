import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceLastCell } from './AudienceLastCell';
import { NowMsProvider } from './NowMsContext';

/** State coverage for the compact last-seen cell. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceLastCell States',
  component: AudienceLastCell,
  parameters: { layout: 'centered' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <NowMsProvider>
          <Story />
        </NowMsProvider>
      );
    },
  ],
} satisfies Meta<typeof AudienceLastCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the compact relative time inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
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
