import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageMatteSection } from './HomepageMatteSection';

const meta: Meta<typeof HomepageMatteSection> = {
  title: 'Marketing/Homepage/HomepageMatteSection',
  component: HomepageMatteSection,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The static poster; the GL field loads after idle where it is allowed. */
export const Poster: Story = {
  args: {
    children: (
      <div className='grid h-96 place-items-center text-primary-token'>
        Content over the matte field
      </div>
    ),
  },
};
