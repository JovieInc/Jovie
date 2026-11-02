import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricRow } from './ContentMetricRow';
import { MeasuredValue } from './MeasuredValue';

const meta = {
  title: 'Molecules/MeasuredValue',
  component: MeasuredValue,
  parameters: { layout: 'padded' },
  args: { state: 'measured', value: '92', source: 'GitHub' },
} satisfies Meta<typeof MeasuredValue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Measured: Story = {};

export const Stale: Story = {
  args: { state: 'stale', value: '4/5', source: 'Lanes feed', ageMs: 720_000 },
};

export const Unknown: Story = {
  args: {
    state: 'unknown',
    source: 'GitHub',
    reason: 'timeout',
    ageMs: 10_800_000,
  },
};

export const NeverSeen: Story = {
  args: { state: 'unknown', source: 'Client telemetry' },
};

/** The three states inside the canonical metric row, as Ovie renders them. */
export const InMetricRows: Story = {
  render: () => (
    <div className='grid max-w-xl gap-2 sm:grid-cols-2'>
      <ContentMetricRow
        label='Merged Today'
        value={<MeasuredValue state='measured' value='92' source='GitHub' />}
      />
      <ContentMetricRow
        label='Lanes Running'
        value={
          <MeasuredValue
            state='stale'
            value='4/5'
            source='Lanes feed'
            ageMs={720_000}
          />
        }
      />
      <ContentMetricRow
        label='Merge Queue'
        value={
          <MeasuredValue
            state='unknown'
            source='GitHub'
            reason='timeout'
            ageMs={10_800_000}
          />
        }
      />
    </div>
  ),
};
