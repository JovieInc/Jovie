import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GroupHeader } from './GroupHeader';

const meta = {
  title: 'Organisms/Table/Atoms/GroupHeader',
  component: GroupHeader,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story, { parameters }) => (
      <table dir={parameters.dir} lang={parameters.lang} className='w-96'>
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
  args: {
    label: 'New',
    count: 12,
    colSpan: 4,
  },
} satisfies Meta<typeof GroupHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NotSticky: Story = {
  args: {
    isSticky: false,
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Awaiting Confirmation From Their Label Before The Release Date',
    count: 128_400,
  },
};

export const RtlLabel: Story = {
  args: {
    label: 'المشتركون الجدد',
    count: 12,
  },
  parameters: { dir: 'rtl', lang: 'ar' },
};
