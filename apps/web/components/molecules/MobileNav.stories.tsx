import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
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

/** Opens the sheet so the state stories show the menu, not just the toggle. */
async function openMenu({
  canvasElement,
}: Readonly<{ canvasElement: HTMLElement }>) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Open menu' })
  );
}

/** No nav links: the sheet keeps Log in and the public CTA. */
export const EmptyNavLinks: Story = {
  args: { navLinks: [], includePublicLogin: true },
  play: openMenu,
};

/** Log in turned off: only the nav links and the CTA remain. */
export const PartialWithoutLogIn: Story = {
  args: {
    navLinks: [
      { href: '/artist-profiles', label: 'Artist Profiles' },
      { href: '/pricing', label: 'Pricing' },
    ],
    includePublicLogin: false,
    publicCtaLabel: 'Get Started',
  },
  play: openMenu,
};

/** Long link and CTA labels in the open sheet. */
export const LongContent: Story = {
  args: {
    navLinks: [
      { href: '/artist-profiles', label: 'Artist Profiles And Press Kits' },
      { href: '/pricing', label: 'Pricing For Labels And Managers' },
    ],
    publicCtaLabel: 'Claim Your Artist Profile Today',
  },
  play: openMenu,
};

/** The open sheet inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    navLinks: [
      { href: '/', label: 'Jovie' },
      { href: '/pricing', label: 'Pricing' },
    ],
    publicCtaLabel: 'Get Started',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: openMenu,
};
