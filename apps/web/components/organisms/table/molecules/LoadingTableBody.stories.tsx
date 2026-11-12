import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LoadingTableBody } from './LoadingTableBody';

const meta = {
  title: 'Organisms/Table/Molecules/LoadingTableBody',
  component: LoadingTableBody,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story, { parameters }) => (
      <table dir={parameters.dir} lang={parameters.lang} className='w-96'>
        {parameters.caption ? (
          <caption className='text-start text-xs text-secondary-token'>
            {parameters.caption}
          </caption>
        ) : null}
        <Story />
      </table>
    ),
  ],
  args: {
    rows: 3,
    columns: 4,
  },
} satisfies Meta<typeof LoadingTableBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithColumnConfig: Story = {
  args: {
    rows: 3,
    columns: 3,
    columnConfig: [
      { width: '48px', variant: 'avatar' },
      { width: '160px', variant: 'text' },
      { width: '80px', variant: 'badge' },
    ],
  },
};

export const LoadingPeoplePage: Story = {
  args: {
    rows: 6,
    columns: 4,
    rowHeight: '40px',
    columnConfig: [
      { width: '180px', variant: 'person' },
      { width: '96px', variant: 'badge' },
      { width: '72px', variant: 'text' },
      { width: '80px', variant: 'button' },
    ],
  },
};

export const PartialColumnConfig: Story = {
  args: {
    rows: 3,
    columns: 4,
    columnConfig: [{ width: '180px', variant: 'person' }],
  },
};

export const RtlPeoplePage: Story = {
  args: {
    rows: 3,
    columns: 3,
    columnConfig: [
      { width: '180px', variant: 'person' },
      { width: '96px', variant: 'badge' },
      { width: '72px', variant: 'text' },
    ],
  },
  parameters: {
    dir: 'rtl',
    lang: 'ar',
    caption: 'جاري تحميل قائمة الجمهور',
  },
};
