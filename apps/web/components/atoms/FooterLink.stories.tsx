import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FooterLink } from './FooterLink';

const meta: Meta<typeof FooterLink> = {
  title: 'UI/FooterLink',
  component: FooterLink,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    tone: {
      control: 'radio',
      options: ['light', 'dark'],
    },
    external: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FooterLink>;

export const Default: Story = {
  args: {
    href: '/about',
    children: 'About Us',
    tone: 'dark',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const LightTone: Story = {
  args: {
    href: '/privacy',
    children: 'Privacy Policy',
    tone: 'light',
  },
};

export const ExternalLink: Story = {
  args: {
    href: 'https://twitter.com/jovie',
    children: 'Twitter',
    external: true,
    tone: 'dark',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const FooterNavigation: Story = {
  render: () => (
    <nav className='flex gap-6 rounded-lg border border-black/6 bg-base p-4'>
      <FooterLink href='/about' tone='dark'>
        About
      </FooterLink>
      <FooterLink href='/pricing' tone='dark'>
        Pricing
      </FooterLink>
      <FooterLink href='/terms' tone='dark'>
        Terms
      </FooterLink>
      <FooterLink href='/privacy' tone='dark'>
        Privacy
      </FooterLink>
    </nav>
  ),
};
