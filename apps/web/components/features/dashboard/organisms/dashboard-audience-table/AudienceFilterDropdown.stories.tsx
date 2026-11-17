import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { AudienceFilterDropdown } from './AudienceFilterDropdown';

/** Segment filter for the audience table toolbar. */
const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/AudienceFilterDropdown',
  component: AudienceFilterDropdown,
  parameters: { layout: 'centered' },
  args: {
    filters: { segments: [] },
    onFiltersChange: fn(),
  },
} satisfies Meta<typeof AudienceFilterDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Partial: some segments selected, so the trigger shows as active. */
export const PartialSelection: Story = {
  args: { filters: { segments: ['highIntent', 'returning'] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Filter' })
    ).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Labelled trigger: the text label shows beside the icon from md up. */
export const WithLabel: Story = {
  args: { iconOnly: false },
};

/** Right-to-left: the trigger inside an RTL document. */
export const RtlDocument: Story = {
  args: { filters: { segments: ['alertsOn'] } },
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
