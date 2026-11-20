import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AudienceCountryCell } from './AudienceCountryCell';

/** State coverage for the country code cell. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceCountryCell States',
  component: AudienceCountryCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    geoCountry: 'US',
  },
} satisfies Meta<typeof AudienceCountryCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no country on record shows "Unknown". */
export const EmptyCountry: Story = {
  args: {
    geoCountry: null,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Unknown')).toBeVisible();
  },
};

/** Right-to-left: the cell inside an RTL document. */
export const RtlCountry: Story = {
  args: {
    geoCountry: 'ae',
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('AE')).toBeVisible();
  },
};
