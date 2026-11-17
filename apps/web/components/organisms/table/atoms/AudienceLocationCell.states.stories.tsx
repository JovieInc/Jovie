import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AudienceLocationCell } from './AudienceLocationCell';

/** State coverage for the location label cell. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceLocationCell States',
  component: AudienceLocationCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    locationLabel: 'Los Angeles, CA',
  },
} satisfies Meta<typeof AudienceLocationCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no location on record shows "Unknown". */
export const EmptyLocation: Story = {
  args: {
    locationLabel: null,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Unknown')).toBeVisible();
  },
};

/** Error: a malformed encoded label falls back to the raw text. */
export const ErrorMalformedEncoding: Story = {
  args: {
    locationLabel: 'S%E3o Paulo',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('S%E3o Paulo')).toBeVisible();
  },
};

/** Long content: a long place name truncates to one line. */
export const LongContentLocation: Story = {
  args: {
    locationLabel:
      'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, Wales, United Kingdom',
  },
  decorators: [
    function NarrowColumn(Story) {
      return (
        <div className='w-48'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic place name inside an RTL document. */
export const RtlLocation: Story = {
  args: {
    locationLabel: 'دبي، الإمارات',
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
};
