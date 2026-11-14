import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatWorkspaceSurface } from './ChatWorkspaceSurface';

const meta = {
  title: 'Jovie/ChatWorkspaceSurface',
  component: ChatWorkspaceSurface,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <div className='flex h-full flex-col justify-between p-4'>
        <p className='text-sm text-secondary-token'>Chat transcript</p>
        <div className='rounded-lg border border-subtle bg-surface-0 p-3 text-sm text-primary-token'>
          Composer
        </div>
      </div>
    ),
  },
} satisfies Meta<typeof ChatWorkspaceSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    Story => (
      <div className='h-96 bg-base'>
        <Story />
      </div>
    ),
  ],
};

/** A long transcript scrolls inside the surface; the composer stays anchored. */
export const LongContentTranscript: Story = {
  args: {
    children: (
      <div className='flex h-full flex-col p-4'>
        <section
          aria-label='Chat transcript'
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point for the scrollable region (axe scrollable-region-focusable)
          tabIndex={0}
          className='min-h-0 flex-1 space-y-3 overflow-y-auto'
        >
          {Array.from({ length: 30 }, (_, index) => index + 1).map(turn => (
            <p
              key={`turn-${turn}`}
              className='text-sm text-secondary-token break-words'
            >
              Turn {turn}: A long assistant reply about release planning for The
              Extraordinarily Long Album Title (Deluxe Anniversary Remastered
              Edition) that wraps across several lines.
            </p>
          ))}
        </section>
        <div className='shrink-0 rounded-lg border border-subtle bg-surface-0 p-3 text-sm text-primary-token'>
          Composer
        </div>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div className='relative h-96 bg-base'>
        <Story />
      </div>
    ),
  ],
};

export const RtlTranscript: Story = {
  args: {
    children: (
      <div className='flex h-full flex-col justify-between p-4'>
        <p className='text-sm text-secondary-token'>سجل المحادثة</p>
        <div className='rounded-lg border border-subtle bg-surface-0 p-3 text-sm text-primary-token'>
          اكتب رسالة
        </div>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='relative h-96 bg-base'>
        <Story />
      </div>
    ),
  ],
};
