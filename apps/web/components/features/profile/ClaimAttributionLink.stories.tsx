import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClaimAttributionLink } from './ClaimAttributionLink';

const meta = {
  title: 'Profile/ClaimAttributionLink',
  component: ClaimAttributionLink,
  parameters: { layout: 'centered' },
  args: {
    href: '/artist/claim?next=auth',
    children: 'Claim your profile',
  },
} satisfies Meta<typeof ClaimAttributionLink>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
