import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  OnboardingArtistConfirmedCard,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
  useArtistSelectionMessage,
} from './OnboardingToolArtifacts';

const artistSearch = vi.hoisted(() => ({
  results: [] as never[],
  state: 'idle',
  error: null,
  search: vi.fn(),
  searchImmediate: vi.fn(),
  clear: vi.fn(),
  query: '',
  isPending: false,
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => artistSearch,
}));
vi.mock('@/lib/queries/useHandleAvailabilityQuery', () => ({
  useHandleAvailabilityQuery: () => ({
    data: { available: true },
    isLoading: false,
    isFetching: false,
  }),
}));

describe('OnboardingToolArtifacts', () => {
  it('keeps what the visitor typed in the artist search field', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: null }}
        onSelectArtist={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Search Spotify artists');
    expect(input).toHaveAttribute('data-host-drawn');
    await user.type(input, 'Alex Example');
    expect(input).toHaveValue('Alex Example');
    expect(
      screen.getByText(/No exact match yet/, { exact: false })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the edited handle and confirms it with the visible button', async () => {
    const user = userEvent.setup();
    const onConfirmHandle = vi.fn();
    const { container } = render(
      <OnboardingHandleCheckCard
        state='output-available'
        output={{ action: 'check_handle', handle: 'alexexample' }}
        onConfirmHandle={onConfirmHandle}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Change Handle' }));
    const input = screen.getByRole('textbox', { name: 'Edit Proposed Handle' });
    expect(input).toHaveAttribute('data-host-drawn');
    await user.clear(input);
    await user.type(input, 'alex.example');
    expect(input).toHaveValue('alex.example');
    await expectNoA11yViolations(container);
  });

  it('keeps the pasted link, hints at a missing path and attaches a full one', async () => {
    const user = userEvent.setup();
    const onAttachAccount = vi.fn();
    const { container } = render(
      <OnboardingSocialLinkCard
        state='output-available'
        output={{ action: 'propose_social_link', url: 'https://instagram.com' }}
        onAttachAccount={onAttachAccount}
      />
    );

    const input = screen.getByRole('textbox', { name: 'Social Profile URL' });
    expect(screen.getByText(/Add the account path/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'https://instagram.com/alexexample');
    expect(input).toHaveValue('https://instagram.com/alexexample');
    await expectNoA11yViolations(container);

    await user.click(screen.getByTestId('onboarding-attach-account'));
    expect(onAttachAccount).toHaveBeenCalledWith(
      'https://www.instagram.com/alexexample/'
    );
  });

  it('announces failures as alerts and running states as status', async () => {
    const failed = render(
      <OnboardingSpotifyArtistPickerCard
        state='output-error'
        onSelectArtist={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Spotify search did not load'
    );
    await expectNoA11yViolations(failed.container);
    failed.unmount();

    const denied = render(
      <OnboardingArtistConfirmedCard state='output-denied' />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Artist profile could not be loaded'
    );
    denied.unmount();

    render(<OnboardingArtistConfirmedCard state='input-streaming' />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Pulling the Spotify profile'
    );
  });

  it('formats the artist selection message', () => {
    function Probe() {
      const format = useArtistSelectionMessage();
      return (
        <p>
          {format({ id: '1', name: 'Alex Example', url: 'https://x.test' })}
        </p>
      );
    }
    render(<Probe />);
    expect(screen.getByText('Selected: Alex Example')).toBeInTheDocument();
  });
});
