import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HowItWorksSection } from './HowItWorksSection';

/** Content states of the section that the base stories do not name. */
const meta = {
  title: 'Organisms/HowItWorksSection/States',
  component: HowItWorksSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HowItWorksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no steps, so only the heading block renders. */
export const EmptyNoSteps: Story = { args: { steps: [] } };

/** Partial: a single step, which draws no connection line. */
export const PartialSingleStep: Story = {
  args: {
    steps: [
      {
        number: '01',
        title: 'Claim your handle',
        description: 'Pick a name fans will remember.',
      },
    ],
  },
};

/** Long content: a long title, description and step copy. */
export const LongContentCopy: Story = {
  args: {
    title:
      'From a Spotify artist profile to a fan conversion machine that works around the clock for every release you ever make',
    description:
      'Three simple steps to turn your streaming profile into a page that captures fans, routes them to their preferred platform and keeps them coming back for the next release.',
    steps: [
      {
        number: '01',
        title: 'Connect Your Spotify Artist Profile And Every Other Platform',
        description:
          'Paste your artist link and Jovie pulls in your releases, artwork and socials so the page is ready before you finish your coffee.',
      },
      {
        number: '02',
        title: 'Share One Link Everywhere You Post',
        description:
          'Use the same link in every bio, story and email so fans always land in the right place.',
      },
    ],
  },
};
