import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { tableRowModeStyle } from '../table.styles';
import { IdentityCell } from './IdentityCell';
import { MeterCell } from './MeterCell';
import { RelativeTimeCell } from './RelativeTimeCell';
import { StatusCell, type StatusCellTone } from './StatusCell';

const NOW = Date.parse('2026-11-20T12:00:00.000Z');
const TONES: ReadonlyArray<[StatusCellTone, string]> = [
  ['positive', 'High'],
  ['attention', 'Rising'],
  ['neutral', 'Dormant'],
  ['negative', 'Blocked'],
  ['info', 'Subscriber'],
];
const ROWS = [
  { name: 'Sasha Fan', secondary: 'sasha@example.com', score: 90, seen: 3 },
  { name: 'Anonymous visitor', secondary: 'Los Angeles', score: 45, seen: 26 },
  {
    name: 'Anonymous visitor',
    secondary: 'via instagram.com',
    score: 0,
    seen: 170,
  },
  { name: 'Noor Ali', secondary: 'Mobile', score: 70, seen: 1500 },
  { name: 'Jules Park', secondary: null, score: 20, seen: 9000 },
];

function Panel({ theme }: Readonly<{ theme: 'light' | 'dark' }>) {
  return (
    <div
      data-theme={theme}
      className={`${theme === 'dark' ? 'dark ' : ''}bg-surface-0 p-4 text-primary-token`}
      data-testid={`data-grid-cells-${theme}`}
    >
      <div className='mb-2 text-2xs text-tertiary-token'>{theme}</div>
      {ROWS.map((row, i) => (
        <div
          key={`${row.name}-${row.secondary ?? 'none'}`}
          style={tableRowModeStyle('compact')}
          className='grid h-(--table-row-height) grid-cols-[minmax(0,1fr)_7rem_6rem_4rem] items-center gap-3 border-b border-subtle px-3'
        >
          <IdentityCell
            name={row.name}
            secondary={row.secondary}
            anonymous={row.name.startsWith('Anonymous')}
          />
          <StatusCell tone={TONES[i % TONES.length][0]}>
            {TONES[i % TONES.length][1]}
          </StatusCell>
          <MeterCell value={row.score} label='Engagement' />
          <RelativeTimeCell
            value={new Date(NOW - row.seen * 60_000).toISOString()}
            nowMs={NOW}
          />
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Design System/Data Grid/Cells',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every kit cell in a compact (40px) row, light and dark. */
export const AllCells: Story = {
  render: () => (
    <div className='grid gap-0 md:grid-cols-2'>
      <Panel theme='light' />
      <Panel theme='dark' />
    </div>
  ),
};
