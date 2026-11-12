import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicSurfaceShell } from './PublicSurfaceShell';

const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceShell',
  component: PublicSurfaceShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <p className='p-6 text-center text-sm text-primary-token'>
        Profile content
      </p>
    ),
  },
} satisfies Meta<typeof PublicSurfaceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const GridPattern: Story = {
  args: {
    backgroundPattern: 'grid',
  },
};

export const WithGradientBlurs: Story = {
  args: {
    showGradientBlurs: true,
  },
};

export const WithAmbientMedia: Story = {
  args: {
    ambientMediaUrl: 'https://placehold.co/800x800',
  },
};

/** No artwork to blur: the shell falls back to the dot pattern and glows. */
export const PartialNoAmbientMedia: Story = {
  args: {
    ambientMediaUrl: null,
    backgroundPattern: 'dots',
    showGradientBlurs: true,
  },
};

const TOUR_ROWS = Array.from(
  { length: 24 },
  (_, index) => `Tour date ${index + 1}: The Echoplex, Los Angeles`
);

/** Content taller than the viewport stays inside the shell. */
export const LongContentScrolls: Story = {
  args: {
    ambientMediaUrl: '/images/avatars/tim-white.jpg',
    children: (
      <section
        aria-label='Tour dates'
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point for the scrollable region (axe scrollable-region-focusable)
        tabIndex={0}
        className='h-dvh space-y-4 overflow-y-auto p-6 text-sm text-primary-token'
      >
        {TOUR_ROWS.map(row => (
          <p key={row}>{row}</p>
        ))}
      </section>
    ),
  },
};

/** The shell and its ambient scrim inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    ambientMediaUrl: '/images/avatars/tim-white.jpg',
    children: (
      <p className='p-6 text-center text-sm text-primary-token'>
        محتوى الملف الشخصي
      </p>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
