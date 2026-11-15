import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MacCinematicSurface } from './MacCinematicSurface';

/**
 * The cinematic shell around the Mac sign-in handoff. It owns the backdrop and
 * the corner mark; the handoff it wraps owns every word and action.
 */
const meta = {
  title: 'Auth/Desktop/MacCinematicSurface',
  component: MacCinematicSurface,
  parameters: { layout: 'fullscreen' },
  args: {
    state: 'idle',
    testId: 'mac-cinematic-surface-story',
    children: null,
  },
} satisfies Meta<typeof MacCinematicSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <section className='relative z-10 flex max-w-90 flex-col items-center gap-2 text-center'>
        <h1 className='text-lg font-medium tracking-tight text-primary-token'>
          Finish Signing In
        </h1>
        <p className='text-sm text-secondary-token'>
          Continue in your browser, then return to Jovie.
        </p>
      </section>
    ),
  },
};

/** Long content: a status paragraph far longer than the handoff ever writes. */
export const LongContentStatus: Story = {
  args: {
    state: 'error',
    children: (
      <section className='relative z-10 flex max-w-90 flex-col items-center gap-2 text-center'>
        <h1 className='text-lg font-medium tracking-tight text-primary-token'>
          Finish Signing In
        </h1>
        <p className='text-sm text-secondary-token'>
          The browser did not open. Try again, or copy the sign-in link and
          paste it into any browser on this Mac. If a password manager or a
          security tool asks before opening links, allow it once, then return
          here. Jovie keeps waiting while you finish in the browser, and this
          window closes on its own when the sign-in completes.
        </p>
      </section>
    ),
  },
};

/** Right-to-left: Arabic handoff copy inside the same shell. */
export const RtlHandoffCopy: Story = {
  args: {
    children: (
      <section
        dir='rtl'
        lang='ar'
        className='relative z-10 flex max-w-90 flex-col items-center gap-2 text-center'
      >
        <h1 className='text-lg font-medium tracking-tight text-primary-token'>
          أكمل تسجيل الدخول
        </h1>
        <p className='text-sm text-secondary-token'>
          تابع في المتصفح، ثم عُد إلى Jovie.
        </p>
      </section>
    ),
  },
};
