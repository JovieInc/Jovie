import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  StableHeaderChipRail,
  StableHeaderTextSlot,
} from './StableHeaderSlots';

/**
 * Layout-stable header slots used by `EntityHeader` / `DrawerHero`. Both
 * reserve their box height even when empty so entity headers never jump
 * (zero layout shift) as data streams in.
 */
const meta = {
  title: 'Atoms/StableHeaderSlots',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextSlotWithContent: Story = {
  name: 'StableHeaderTextSlot / with content',
  render: () => (
    <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1}>
        Taylor Swift
      </StableHeaderTextSlot>
    </div>
  ),
};

export const TextSlotTwoLines: Story = {
  name: 'StableHeaderTextSlot / two lines',
  render: () => (
    <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='sm' lineCount={2}>
        A very long subtitle that wraps onto a second line before truncating
      </StableHeaderTextSlot>
    </div>
  ),
};

export const EmptyTextSlotReserved: Story = {
  name: 'StableHeaderTextSlot / reserved (empty)',
  render: () => (
    <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1} reserve />
    </div>
  ),
};

export const ChipRailWithContent: Story = {
  name: 'StableHeaderChipRail / with content',
  render: () => (
    <div className='w-72 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderChipRail>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Verified
        </span>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Pro
        </span>
      </StableHeaderChipRail>
    </div>
  ),
};

export const EmptyChipRailReserved: Story = {
  name: 'StableHeaderChipRail / reserved (empty)',
  render: () => (
    <div className='w-72 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderChipRail reserve />
    </div>
  ),
};

/**
 * Partial: the title has arrived, the subtitle has not, and the chips have.
 * The reserved subtitle keeps the header at its final height.
 */
export const PartialStreamedHeader: Story = {
  name: 'Header / partially streamed',
  render: () => (
    <div className='w-72 space-y-1 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1}>
        Midnight Drive
      </StableHeaderTextSlot>
      <StableHeaderTextSlot size='xs' lineCount={1} reserve />
      <StableHeaderChipRail>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Single
        </span>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Live on DSPs
        </span>
      </StableHeaderChipRail>
    </div>
  ),
};

const LONG_CHIPS = [
  'Electronic',
  'Deep house',
  'Melodic techno',
  'Spotify editorial',
  'Apple Music',
  'Beatport Top 100',
  'Pre-save live',
];

/**
 * Long content: a one-line title truncates, a two-line subtitle clamps, and
 * the chip rail scrolls instead of wrapping.
 */
export const LongContentClampAndScroll: Story = {
  name: 'Header / long content',
  render: () => (
    <div className='w-64 space-y-1 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1}>
        Florence Okonkwo-Vasquez and the Northern Lights Philharmonic Collective
      </StableHeaderTextSlot>
      <StableHeaderTextSlot size='sm' lineCount={2}>
        Midnight Drive (Extended Club Mix) [feat. Maya Vale, DJ Kenji Takahashi
        and the Sunset Boulevard Choir] · Deluxe Anniversary Edition · 2026
      </StableHeaderTextSlot>
      <StableHeaderChipRail>
        {LONG_CHIPS.map(chip => (
          <span
            className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'
            key={chip}
          >
            {chip}
          </span>
        ))}
      </StableHeaderChipRail>
    </div>
  ),
};

/** Right-to-left: Arabic title, subtitle and chips in an RTL header. */
export const RtlArabicHeader: Story = {
  name: 'Header / right-to-left',
  render: () => (
    <div
      dir='rtl'
      className='w-64 space-y-1 rounded-md border border-subtle bg-surface-0 p-3'
    >
      <StableHeaderTextSlot size='md' lineCount={1}>
        فرقة النور للموسيقى الشرقية والأوركسترا الوطنية للشباب
      </StableHeaderTextSlot>
      <StableHeaderTextSlot size='sm' lineCount={2}>
        ليالي القاهرة · إصدار خاص بمناسبة الذكرى العاشرة مع تسجيلات حية من مسرح
        الأوبرا
      </StableHeaderTextSlot>
      <StableHeaderChipRail>
        {['طرب', 'موسيقى شرقية', 'متوفر على أنغامي', 'إصدار جديد'].map(chip => (
          <span
            className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'
            key={chip}
          >
            {chip}
          </span>
        ))}
      </StableHeaderChipRail>
    </div>
  ),
};
