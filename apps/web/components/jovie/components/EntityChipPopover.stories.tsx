import { Textarea } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityChip } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';

const meta = {
  title: 'Jovie/EntityChipPopover',
  component: EntityChipPopover,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8'>
        <Story />
      </div>
    ),
  ],
  args: {
    kind: 'release',
    id: 'rel_1',
    label: 'Midnight Drive',
    children: (
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Midnight Drive' }}
        variant='transcript'
      />
    ),
  },
} satisfies Meta<typeof EntityChipPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the reference is no longer available, so the chip shows a placeholder label. */
export const PartialUnavailable: Story = {};

export const Renamed: Story = {
  args: {
    entity: { kind: 'release', id: 'rel_1', label: 'Current title' },
    children: (
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Current title' }}
        variant='transcript'
      />
    ),
  },
};

/** Long content: a very long release title stays inside the chip. */
export const LongContentTitle: Story = {
  args: {
    entity: {
      kind: 'release',
      id: 'rel_1',
      label:
        'A Very Long Release Title That Keeps Going Past The Width Of The Chat Transcript Line',
    },
    children: (
      <EntityChip
        data={{
          kind: 'release',
          id: 'rel_1',
          label:
            'A Very Long Release Title That Keeps Going Past The Width Of The Chat Transcript Line',
        }}
        variant='transcript'
      />
    ),
  },
  decorators: [
    Story => (
      <div className='w-full max-w-xs'>
        <Story />
      </div>
    ),
  ],
};

/** Rtl: right-to-left release title. */
export const RtlTitle: Story = {
  args: {
    entity: { kind: 'release', id: 'rel_1', label: 'منتصف الليل' },
    children: (
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'منتصف الليل' }}
        variant='transcript'
      />
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

/** Two adjacent references simulate keyboard and pointer crossing in chat. */
export const AdjacentReferences: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <Textarea label='Draft' />
      <div className='flex gap-4'>
        {['Sober', 'Midnight Drive'].map((label, index) => {
          const data = {
            kind: 'release' as const,
            id: `fixture_${index}`,
            label,
          };
          return (
            <EntityChipPopover key={data.id} {...data} entity={data}>
              <EntityChip data={data} variant='transcript' />
            </EntityChipPopover>
          );
        })}
      </div>
    </div>
  ),
};
