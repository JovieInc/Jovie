import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleasesExperience } from './DemoReleasesExperience';

const meta = {
  title: 'Features/Demo/DemoReleasesExperience',
  component: DemoReleasesExperience,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The /demo/releases page body: the real authenticated releases experience wrapped in DemoAuthShell and fed entirely by mock release data, so it needs no auth or database access.',
      },
    },
  },
} satisfies Meta<typeof DemoReleasesExperience>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InternalDj: Story = {
  args: {
    variant: 'internal-dj',
  },
};

export const Founder: Story = {
  args: {
    variant: 'founder',
  },
};
