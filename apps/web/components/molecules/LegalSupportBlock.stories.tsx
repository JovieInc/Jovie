import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LegalSupportBlock } from './LegalSupportBlock';

const meta = {
  title: 'Molecules/LegalSupportBlock',
  component: LegalSupportBlock,
  parameters: {
    layout: 'padded',
  },
  args: {
    description: 'Questions about this policy? Our team is happy to help.',
    email: 'privacy@jov.ie',
  },
} satisfies Meta<typeof LegalSupportBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomTitle: Story = {
  args: {
    title: 'Contact legal',
    email: 'legal@jov.ie',
  },
};
