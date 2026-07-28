import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TourDatesEmptyState } from './TourDatesEmptyState';

/**
 * JOV-4463: Bandsintown setup flow empty state. The lead visual must render
 * the canonical integration icon (a missing registry entry previously left an
 * empty rounded square). Desktop + mobile stories give Chromatic regression
 * coverage at both sizes.
 */
const meta: Meta<typeof TourDatesEmptyState> = {
  title: 'Dashboard/Organisms/TourDatesEmptyState',
  component: TourDatesEmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    profileId: 'storybook-profile',
  },
  argTypes: {
    hasApiKey: {
      control: 'boolean',
      description:
        'Step 1 (API key setup) when false, step 2 (artist connect) when true',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Step 1 — API key setup, desktop
export const ApiKeySetup: Story = {
  args: {
    hasApiKey: false,
  },
};

// Step 1 — API key setup, mobile
export const ApiKeySetupMobile: Story = {
  args: {
    hasApiKey: false,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Step 2 — Artist connection, desktop
export const ArtistConnect: Story = {
  args: {
    hasApiKey: true,
  },
};

// Step 2 — Artist connection, mobile
export const ArtistConnectMobile: Story = {
  args: {
    hasApiKey: true,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
