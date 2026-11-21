import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTableLoadingShell } from './AudienceTableLoadingShell';

function RtlFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div dir='rtl' lang='ar'>
      {children}
    </div>
  );
}

const meta = {
  title:
    'Features/Dashboard/Organisms/DashboardAudienceTable/AudienceTableLoadingShell/States',
  component: AudienceTableLoadingShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AudienceTableLoadingShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the shell is the loading face of the Audience table. */
export const Loading: Story = {};

/** Rtl: toolbar, rows and skeleton table mirror in a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    function WithRtl(Story) {
      return (
        <RtlFrame>
          <Story />
        </RtlFrame>
      );
    },
  ],
};
