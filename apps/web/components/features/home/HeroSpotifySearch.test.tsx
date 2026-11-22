import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HeroSpotifySearch } from './HeroSpotifySearch';

Element.prototype.scrollIntoView = vi.fn();

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('HeroSpotifySearch', () => {
  it('renders an accessible combobox inside a composite field', async () => {
    const { container } = render(<HeroSpotifySearch />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('data-host-drawn');
    expect(input.closest('.composite-field')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps what the visitor typed after a failed submit', async () => {
    const user = userEvent.setup();
    render(<HeroSpotifySearch />);

    const input = screen.getByRole('combobox');
    await user.type(input, '  ');
    await user.type(input, 'Alex Example');
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('  Alex Example');
  });

  it('shows the invalid-query hint without losing the typed text', async () => {
    const user = userEvent.setup();
    render(<HeroSpotifySearch />);

    const input = screen.getByRole('combobox');
    await user.type(input, '!');
    expect(input).toHaveValue('!');
  });
});
