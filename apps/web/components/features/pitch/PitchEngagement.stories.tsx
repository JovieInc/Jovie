import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PitchEngagement } from './PitchEngagement';

/**
 * PitchEngagement renders nothing; it listens to the pitch deck around it.
 * The stories mount it beside a small deck fixture.
 */
const meta = {
  title: 'Features/Pitch/PitchEngagement',
  component: PitchEngagement,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PitchEngagement>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDeck: Story = {
  render: () => (
    <div className='space-y-4 text-primary-token'>
      <PitchEngagement />
      <section data-pitch-slide='problem' className='text-sm'>
        Artists drop more music with less work.
      </section>
      <details data-pitch-section='founder-letter' className='text-sm'>
        <summary>Founder letter</summary>
        <p className='text-secondary-token'>Why now.</p>
      </details>
    </div>
  ),
};

/** Empty: no slides, video or actions to track; nothing is rendered. */
export const EmptyNoSlides: Story = {};
