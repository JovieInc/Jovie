import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AudienceVisitsCell } from './AudienceVisitsCell';

/** State coverage for the visit count with its intent badge. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceVisitsCell States',
  component: AudienceVisitsCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    visits: 6,
    intentLevel: 'medium',
  },
} satisfies Meta<typeof AudienceVisitsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Zero visits: a member who has not visited yet still shows a count. */
export const ZeroVisits: Story = {
  args: {
    visits: 0,
    intentLevel: 'low',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('0')).toBeVisible();
  },
};

/** Long content: a seven-digit visit count beside the badge. */
export const LongContentVisitCount: Story = {
  args: {
    visits: 1_284_903,
    intentLevel: 'high',
  },
};

/** Right-to-left: the count and badge inside an RTL document. */
export const RtlVisits: Story = {
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
