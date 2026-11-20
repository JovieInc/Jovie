import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PageSpecSections } from './PageSpecSections';

const meta = {
  title: 'Marketing/PageSpecSections',
  component: PageSpecSections,
  args: {
    sections: [
      {
        id: 'hero',
        type: 'hero',
        background: 'base',
        title: 'One link for every release',
        body: 'Share a release once and let listeners pick where to play it.',
        cta: { label: 'Claim your profile', href: '/start' },
      },
      {
        id: 'features',
        type: 'feature-list',
        background: 'raised',
        title: 'What you get',
        items: [
          {
            id: 'remembered',
            title: 'Remembered choice',
            body: 'Listeners keep their streaming service on every release.',
            icon: 'link',
          },
          {
            id: 'analytics',
            title: 'Link analytics',
            body: 'See which sources send listeners to each release.',
          },
        ],
      },
    ],
  },
} satisfies Meta<typeof PageSpecSections>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
