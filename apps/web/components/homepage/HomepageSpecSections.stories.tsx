import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DEFAULT_HOME_SPEC } from '@/lib/content-records/marketing-page';
import { HomepageSpecSections } from './HomepageSpecSections';

const meta = {
  title: 'Marketing/HomepageSpecSections',
  component: HomepageSpecSections,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The homepage rendered from a published page spec: registered DS sections in spec order, with copy slots filled from the content record.',
      },
    },
  },
  args: { sections: DEFAULT_HOME_SPEC.sections },
} satisfies Meta<typeof HomepageSpecSections>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CodeDefault: Story = {};

export const HeroAndClose: Story = {
  args: {
    sections: DEFAULT_HOME_SPEC.sections.filter(
      section => section.section !== 'product-gallery'
    ),
  },
};
