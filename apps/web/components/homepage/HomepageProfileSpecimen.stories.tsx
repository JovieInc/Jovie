import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HomepageProfileSpecimen } from './HomepageProfileSpecimen';

const meta = {
  title: 'Marketing/HomepageProfileSpecimen',
  component: HomepageProfileSpecimen,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Illustrative Jovie profile specimen for the v3 homepage hero. Avery Chen is fictional example content; the caption labels it as a preview and the action pill is non-interactive.',
      },
    },
  },
} satisfies Meta<typeof HomepageProfileSpecimen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    specimen: HOMEPAGE_IDENTITY_COPY.hero.specimen,
  },
};
