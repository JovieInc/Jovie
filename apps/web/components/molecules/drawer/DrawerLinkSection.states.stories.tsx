import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerLinkSection } from './DrawerLinkSection';

const meta = {
  title: 'Molecules/Drawer/DrawerLinkSection/States',
  component: DrawerLinkSection,
  parameters: { layout: 'centered' },
  decorators: [
    function SectionFrame(Story) {
      return (
        <div className='w-80'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    title: 'DSP links',
    onAdd: fn(),
    children: <div className='px-1 text-sm text-secondary-token'>Spotify</div>,
  },
} satisfies Meta<typeof DrawerLinkSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a read-only section with no add button and a hidden heading. */
export const PartialReadOnly: Story = {
  args: { onAdd: undefined, showHeading: false },
};

/** Long content: a long title truncates beside the add button. */
export const LongContentTitle: Story = {
  args: {
    title:
      'Streaming, download and store links for every release in the catalog',
  },
};

/** Rtl: the header and add button mirror in a right-to-left layout. */
export const RtlSection: Story = {
  args: { title: 'روابط المنصات' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-80'>
          <Story />
        </div>
      );
    },
  ],
};
