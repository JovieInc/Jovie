import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EntityRail } from './EntityRail';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/EntityRail States',
  component: EntityRail,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    entityType: 'release',
    isOpen: true,
    eyebrow: 'Release',
    title: 'Lost in the Light',
    onClose: fn(),
  },
} satisfies Meta<typeof EntityRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing is selected, so the rail shows its empty message. */
export const EmptyNothingSelected: Story = {
  args: {
    isEmpty: true,
  },
};

/** Partial: a header with no properties or activity, stats not measured yet. */
export const PartialHeaderOnly: Story = {
  args: {
    subtitle: undefined,
  },
};

/** Long content: long title, property values and activity in the rail. */
export const LongContentRelease: Story = {
  args: {
    title:
      'Lost in the Light (Deluxe Edition with Bonus Remixes and Acoustic Versions)',
    subtitle:
      'Independent Artist Collective featuring the Extremely Long Named Orchestra',
    overviewProperties: [
      { label: 'Type', value: 'Album' },
      {
        label: 'Name',
        value:
          'Lost in the Light (Deluxe Edition with Bonus Remixes and Acoustic Versions)',
        copyValue: 'Lost in the Light (Deluxe Edition)',
      },
      {
        label: 'Rights holder',
        value: 'Independent Artist Collective and Partners Publishing Group',
      },
    ],
    activityItems: [
      {
        id: 'long-1',
        actor: 'Alexandria Catalina Rivera-Montgomery',
        verb: 'edited',
        object:
          'Lost in the Light (Deluxe Edition with Bonus Remixes and Acoustic Versions)',
        at: '2026-01-15T10:00:00Z',
      },
    ],
  },
};

/** Right-to-left: Arabic copy inside an RTL document. */
export const RtlArabicRelease: Story = {
  args: {
    eyebrow: 'إصدار',
    title: 'ضائع في الضوء',
    subtitle: 'ألبوم مستقل',
    overviewProperties: [
      { label: 'النوع', value: 'ألبوم' },
      { label: 'الحالة', value: 'نشط' },
    ],
  },
  decorators: [RtlFrame],
};
