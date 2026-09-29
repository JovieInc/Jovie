import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceSourceCell } from './AudienceSourceCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceSourceCell',
  component: AudienceSourceCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    referrerHistory: [{ url: 'https://instagram.com/', timestamp: '' }],
  },
} satisfies Meta<typeof AudienceSourceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FromInstagram: Story = {};

export const FromUtm: Story = {
  args: {
    referrerHistory: [],
    utmParams: { source: 'newsletter', medium: 'email' },
  },
};

export const Direct: Story = {
  args: {
    referrerHistory: [],
  },
};
