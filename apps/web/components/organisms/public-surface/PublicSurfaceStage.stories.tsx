import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicSurfaceStage } from './PublicSurfaceStage';

const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceStage',
  component: PublicSurfaceStage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <p className='p-6 text-center text-sm text-primary-token'>
        Profile card content
      </p>
    ),
  },
} satisfies Meta<typeof PublicSurfaceStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAfterPanel: Story = {
  args: {
    afterPanel: (
      <p className='mt-4 text-center text-2xs text-tertiary-token'>
        Powered by Jovie
      </p>
    ),
  },
};

const TOUR_ROWS = Array.from(
  { length: 24 },
  (_, index) => `Tour date ${index + 1}: The Echoplex, Los Angeles`
);

/** Content taller than the viewport scrolls naturally inside the stage. */
export const LongContentScrolls: Story = {
  args: {
    children: (
      <div className='space-y-4 p-6 text-sm text-primary-token'>
        {TOUR_ROWS.map(row => (
          <p key={row}>{row}</p>
        ))}
      </div>
    ),
  },
};

/** The stage and its footer inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    ...WithAfterPanel.args,
    children: (
      <p className='p-6 text-center text-sm text-primary-token'>
        محتوى بطاقة الملف الشخصي
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
