import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ListenNowFormView } from './ListenNowForm';

vi.mock('@/components/organisms/artist-search-palette', () => ({
  ArtistSearchCommandPalette: () => null,
}));
vi.mock('@/components/feedback', () => ({ toast: { success: vi.fn() } }));

type ViewProps = React.ComponentProps<typeof ListenNowFormView>;

function makeProps(overrides: Partial<ViewProps> = {}): ViewProps {
  return {
    primaryFields: { spotifyUrl: '', appleMusicUrl: '', youtubeUrl: '' },
    additionalLinks: [],
    connectedDspInfo: {},
    updatePrimaryField: vi.fn(),
    schedulePrimaryNormalize: vi.fn(),
    handlePrimaryBlur: vi.fn(),
    addAdditionalLink: vi.fn(),
    removeAdditionalLink: vi.fn(),
    updateAdditionalLink: vi.fn(),
    scheduleAdditionalNormalize: vi.fn(),
    handleAdditionalBlur: vi.fn(),
    handleSubmit: vi.fn(e => e.preventDefault()),
    loading: false,
    initialLoading: false,
    error: undefined,
    success: false,
    isDarkTheme: false,
    ...overrides,
  };
}

/** Stateful wrapper so typing round-trips through real React state. */
function Harness(overrides: Partial<ViewProps>) {
  const [fields, setFields] = React.useState({
    spotifyUrl: '',
    appleMusicUrl: '',
    youtubeUrl: '',
  });
  const [tick, setTick] = React.useState(0);
  return (
    <div data-tick={tick}>
      <button type='button' onClick={() => setTick(t => t + 1)}>
        rerender
      </button>
      <ListenNowFormView
        {...makeProps({
          primaryFields: fields,
          updatePrimaryField: (key, value) =>
            setFields(f => ({ ...f, [key]: value })),
          ...overrides,
        })}
      />
    </div>
  );
}

describe('ListenNowFormView', () => {
  it('keeps typed URLs and focus across a rerender and blur, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const spotify = screen.getByLabelText('Spotify URL');
    await user.type(spotify, 'https://open.spotify.com/artist/x');
    await user.click(screen.getByRole('button', { name: 'rerender' }));
    expect(spotify).toHaveValue('https://open.spotify.com/artist/x');
    await user.click(spotify);
    expect(spotify).toHaveFocus();
    await user.tab();
    expect(spotify).toHaveValue('https://open.spotify.com/artist/x');
    await expectNoA11yViolations(container);
  });

  it('shows a skeleton of three rows while the initial load runs', () => {
    const { container } = render(
      <ListenNowFormView {...makeProps({ initialLoading: true })} />
    );
    expect(screen.queryByTestId('listen-now-form')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  });

  it('offers Search only for unconnected platforms and adds an extra platform', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ListenNowFormView {...props} />);
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Add Platform' }));
    expect(props.addAdditionalLink).toHaveBeenCalled();
  });

  it('renders additional rows, removes one and submits the form', async () => {
    const user = userEvent.setup();
    const props = makeProps({
      primaryFields: {
        spotifyUrl: 'https://open.spotify.com/artist/x',
        appleMusicUrl: '',
        youtubeUrl: '',
      },
      connectedDspInfo: {
        spotify: {
          artistName: 'Mina Vale',
          artistImageUrl: null,
          externalUrl: 'https://open.spotify.com/artist/x',
        },
      },
      additionalLinks: [
        { id: 'sc', platform: 'soundcloud', url: 'https://soundcloud.com/m' },
      ],
      error: 'Could not save',
      success: false,
    });
    const { container } = render(<ListenNowFormView {...props} />);
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(1);
    expect(screen.getByText('Mina Vale')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove SoundCloud' }));
    expect(props.removeAdditionalLink).toHaveBeenCalledWith(0);
    await user.click(screen.getByRole('button', { name: 'Save Music Links' }));
    expect(props.handleSubmit).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
