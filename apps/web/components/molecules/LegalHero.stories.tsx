import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LegalHero } from './LegalHero';

const meta = {
  title: 'Molecules/LegalHero',
  component: LegalHero,
  parameters: {
    layout: 'padded',
  },
  args: {
    title: 'Terms of Service',
    lastUpdated: 'September 1, 2026',
    practicalSummary:
      'The short version: use Jovie in good faith, keep your account secure, and we will keep the lights on.',
  },
} satisfies Meta<typeof LegalHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutLastUpdated: Story = {
  args: {
    lastUpdated: '',
  },
};

export const LongTitle: Story = {
  args: {
    title: 'Data Processing Addendum and Sub-processor List',
  },
};
