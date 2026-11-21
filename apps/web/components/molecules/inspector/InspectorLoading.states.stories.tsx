import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { InspectorLoading } from './InspectorLoading';

const column: Decorator = function InspectorColumn(Story) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

/** State coverage for the inspector skeleton; Default lives in InspectorLoading.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/InspectorLoading States',
  component: InspectorLoading,
  decorators: [column],
  args: { rows: 4 },
} satisfies Meta<typeof InspectorLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the default four skeleton fact rows, announced as busy. */
export const LoadingFourRows: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('inspector-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.getByText('Loading inspector')).toBeInTheDocument();
  },
};

/** Empty: zero rows still announces the busy region, with no skeleton rows. */
export const EmptyZeroRows: Story = {
  args: { rows: 0 },
};

/** Long content: a long fact list keeps every skeleton row on the 96px grid. */
export const LongContentManyRows: Story = {
  args: { rows: 18 },
};

/** Right-to-left: the skeleton grid inside an RTL inspector. */
export const RtlDocument: Story = {
  decorators: [rtl],
};
