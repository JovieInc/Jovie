import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageTrackedLink } from './HomepageTrackedLink';

const meta = {
  title: 'Homepage/HomepageTrackedLink',
  component: HomepageTrackedLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/start',
    eventName: 'homepage_cta_clicked',
    children: 'Find your name',
  },
} satisfies Meta<typeof HomepageTrackedLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithEventProperties: Story = {
  args: {
    eventProperties: { placement: 'hero' },
  },
};
