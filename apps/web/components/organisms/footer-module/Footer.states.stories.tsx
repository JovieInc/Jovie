import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { Footer } from './Footer';

/** Link-count states of the footer that the base stories do not name. */
const meta: Meta<typeof Footer> = {
  title: 'Organisms/Footer/States',
  component: Footer,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof Footer>;

/** Empty: a minimal footer with no caller links, only the branding. */
export const EmptyMinimalNoLinks: Story = {
  args: { variant: 'minimal', links: [] },
};

/** Long content: link labels long enough to wrap on a narrow row. */
export const LongContentMinimalLinks: Story = {
  args: {
    variant: 'minimal',
    links: [
      {
        href: APP_ROUTES.LEGAL_PRIVACY,
        label: 'Privacy And Data Protection Notice For Every Region',
      },
      {
        href: APP_ROUTES.LEGAL_TERMS,
        label: 'Terms Of Service And Acceptable Use Policy',
      },
    ],
  },
};
