import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  OnboardingHandleCheckCard,
  OnboardingSpotifyArtistPickerCard,
} from './OnboardingToolArtifacts';

const meta = {
  title: 'Features/Onboarding/OnboardingToolArtifacts',
  component: OnboardingSpotifyArtistPickerCard,
  parameters: {
    layout: 'centered',
    // No story variant exercises the disabled state yet.
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    onSelectArtist: () => {},
  },
} satisfies Meta<typeof OnboardingSpotifyArtistPickerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Early states only — avoids the live artist-search network query.
export const Searching: Story = {
  args: {
    state: 'input-streaming',
  },
};

export const SearchFailed: Story = {
  args: {
    state: 'output-error',
  },
};

/**
 * Proposed handle (Pen R6As7U): one "jov.ie/<handle> is available" line and
 * one Confirm Handle action; Change Handle opens the field.
 */
export const HandleAvailable: Story = {
  render: () => {
    (
      window as Window & {
        __jovieApiMock?: (request: { url: URL }) => Response | undefined;
      }
    ).__jovieApiMock = ({ url }) =>
      url.pathname === '/api/handle/check'
        ? Response.json({ available: true, handle: 'timwhite' })
        : undefined;
    return (
      <div style={{ width: 640, padding: 24 }}>
        <OnboardingHandleCheckCard
          state='output-available'
          output={{ action: 'check_handle', handle: 'timwhite' }}
          onConfirmHandle={() => {}}
        />
      </div>
    );
  },
};
