import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { Footer } from './Footer';

const meta: Meta<typeof Footer> = {
  title: 'Organisms/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Footer>;

export const Regular: Story = {
  args: {
    variant: 'regular',
  },
};

export const Profile: Story = {
  args: {
    variant: 'profile',
    artistHandle: 'artistname',
  },
};

export const MinimalWithLinks: Story = {
  args: {
    variant: 'minimal',
    links: [
      { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
      { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
    ],
  },
};
