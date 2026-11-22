import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ArtistSelectionForm,
  ArtistSelectionFormView,
} from './ArtistSelectionForm';
import type { SearchResult, UseArtistSelectionFormReturn } from './types';

vi.mock('@/components/site/theme-toggle', () => ({
  ThemeToggle: () => <button type='button'>Toggle theme</button>,
}));

vi.mock('@/components/organisms/Combobox', () => ({
  Combobox: ({
    label,
    placeholder,
    onInputChange,
  }: {
    readonly label: string;
    readonly placeholder: string;
    readonly onInputChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <input
        placeholder={placeholder}
        onChange={event => onInputChange(event.target.value)}
      />
    </label>
  ),
}));

const hookState = vi.hoisted(() => ({
  value: null as UseArtistSelectionFormReturn | null,
}));
vi.mock('./useArtistSelectionForm', () => ({
  useArtistSelectionForm: () => hookState.value,
}));

const artist: SearchResult = {
  id: 'artist-1',
  name: 'Sasha Waves',
  url: 'https://open.spotify.com/artist/artist-1',
  popularity: 62,
};

function makeProps(
  overrides: Partial<UseArtistSelectionFormReturn> = {}
): UseArtistSelectionFormReturn {
  return {
    selectedArtist: null,
    pendingClaim: null,
    state: { loading: false, error: null, retryCount: 0 },
    searchError: null,
    isLoading: false,
    options: [],
    handleArtistSelect: vi.fn(),
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(async () => undefined),
    handleSkip: vi.fn(),
    retryOperation: vi.fn(),
    ...overrides,
  };
}

describe('ArtistSelectionFormView', () => {
  it('skips, and disables Continue until an artist is chosen', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    const { container } = render(<ArtistSelectionFormView {...props} />);

    expect(
      screen.getByRole('button', { name: 'Continue with This Artist' })
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Skip For Now' }));

    expect(props.handleSkip).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the selected artist on neutral tokens and removes it from a real button', async () => {
    const user = userEvent.setup();
    const props = makeProps({ selectedArtist: artist });
    const { container } = render(<ArtistSelectionFormView {...props} />);

    expect(screen.getByText('Artist selected').className).toContain(
      'text-secondary-token'
    );
    expect(container.innerHTML).not.toMatch(/green-\d{3}/);
    const remove = screen.getByRole('button', { name: 'Remove Sasha Waves' });
    expect(remove).toHaveAttribute('type', 'button');
    await user.click(remove);

    expect(props.handleArtistSelect).toHaveBeenCalledWith(null);
    expect(
      screen.getByRole('button', { name: 'Continue with This Artist' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('offers Retry until the retry limit, then says Max retries', async () => {
    const user = userEvent.setup();
    const props = makeProps({
      state: { loading: false, error: 'Could not save', retryCount: 1 },
    });
    const { container, rerender } = render(
      <ArtistSelectionFormView {...props} />
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.retryOperation).toHaveBeenCalledTimes(1);

    rerender(
      <ArtistSelectionFormView
        {...props}
        state={{ loading: false, error: 'Could not save', retryCount: 3 }}
      />
    );
    expect(screen.getByRole('button', { name: 'Max retries' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('names the pending Spotify claim in the heading copy', () => {
    render(
      <ArtistSelectionFormView
        {...makeProps({
          pendingClaim: {
            spotifyId: 'artist-1',
            artistName: 'Sasha Waves',
            timestamp: 0,
          },
        })}
      />
    );

    expect(
      screen.getByText('We found "Sasha Waves" in your Spotify. Is this you?')
    ).toBeInTheDocument();
  });

  it('shows Saving while the choice is stored', () => {
    render(
      <ArtistSelectionFormView
        {...makeProps({
          selectedArtist: artist,
          state: { loading: true, error: null, retryCount: 0 },
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});

describe('ArtistSelectionForm', () => {
  it('renders the hook state through the view', () => {
    hookState.value = makeProps({ selectedArtist: artist });

    render(<ArtistSelectionForm />);

    expect(screen.getByText('Sasha Waves')).toBeInTheDocument();
  });
});
