import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageCertifiedSections } from './HomepageCertifiedSections';

const meta = {
  title: 'Marketing/HomepageCertifiedSections',
  component: HomepageCertifiedSections,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Canonical Pen homepage body: "Your presence, resolved." with the purple satin material strip (used once) and "A clear next step.", then "Structure that travels." with the open anatomy of your Jovie profile (Profile, Links, Events, Payments).',
      },
    },
  },
} satisfies Meta<typeof HomepageCertifiedSections>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
