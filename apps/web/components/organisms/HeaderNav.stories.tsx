import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderNav, type HeaderNavProps } from './HeaderNav';

const meta: Meta<HeaderNavProps> = {
  title: 'Organisms/HeaderNav',
  component: HeaderNav,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
        query: {},
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story - shows the header navigation
export const Default: Story = {};

export const PublicStatic: Story = {
  args: {
    authMode: 'public-static',
    publicCta: {
      href: APP_ROUTES.START,
      label: 'Get started',
    },
  },
};

// Mobile view story
export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Dark theme story
export const DarkTheme: Story = {
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
  decorators: [
    Story => (
      <div className='dark bg-gray-900 min-h-screen'>
        <Story />
      </div>
    ),
  ],
};

/** A public header with no nav links: the desktop group and divider drop out. */
export const EmptyNavLinks: Story = {
  args: {
    authMode: 'public-static',
    navLinks: [],
  },
};

/** The minimal header: a Log in text link and no public CTA. */
export const PartialMinimalAuth: Story = {
  args: {
    authMode: 'public-static',
    minimalAuth: true,
    minimalAuthLabel: 'Log in',
  },
};

/** Long nav labels and CTA copy share the header row. */
export const LongContent: Story = {
  args: {
    authMode: 'public-static',
    navLinks: [
      { href: '/artist-profiles', label: 'Artist Profiles And Press Kits' },
      { href: APP_ROUTES.PRICING, label: 'Pricing For Labels And Managers' },
    ],
    publicCta: { href: APP_ROUTES.SIGNUP, label: 'Claim Your Profile' },
  },
};

/** The public header inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    authMode: 'public-static',
    navLinks: [{ href: APP_ROUTES.PRICING, label: 'Pricing' }],
    publicCta: { href: APP_ROUTES.SIGNUP, label: 'Get Started' },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
