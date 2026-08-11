import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MobileNav } from './MobileNav';

const meta: Meta<typeof MobileNav> = {
  title: 'Molecules/MobileNav',
  component: MobileNav,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-svh items-start justify-end bg-base p-5 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MobileNav>;

export const MarketingMenu: Story = {
  args: {
    navLinks: [
      { href: '/', label: 'Jovie' },
      { href: '/artist-profiles', label: 'Artist Profiles' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/support', label: 'Support' },
    ],
    includePublicLogin: true,
    publicCtaHref:
      '/start?starter_prompt=Hey%2C+I+want+to+get+access+to+Jovie.',
    publicCtaLabel: 'Get Started',
  },
};
