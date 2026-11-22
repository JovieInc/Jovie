import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UniversalLinkInput } from './UniversalLinkInput';

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    error: null,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
    query: '',
    isPending: false,
  }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

function Harness(
  props: Partial<React.ComponentProps<typeof UniversalLinkInput>>
) {
  const [tick, setTick] = React.useState(0);
  return (
    <div data-tick={tick}>
      <button type='button' onClick={() => setTick(t => t + 1)}>
        rerender
      </button>
      <UniversalLinkInput onAdd={vi.fn()} {...props} />
    </div>
  );
}

describe('UniversalLinkInput', () => {
  it('keeps typed text across a parent rerender and blur, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = screen.getByLabelText('Link URL');
    await user.type(input, 'https://example.com/x');
    await user.click(screen.getByRole('button', { name: 'rerender' }));
    expect(input).toHaveValue('https://example.com/x');
    await user.click(input);
    expect(input).toHaveFocus();
    await user.tab();
    expect(input).toHaveValue('https://example.com/x');
    await expectNoA11yViolations(container);
  });

  it('adds a detected link on submit', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(
      screen.getByLabelText('Link URL'),
      'https://open.spotify.com/artist/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('offers platform suggestions for a plain-word query and commits a choice', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness chatEnabled={false} />);
    await user.type(screen.getByLabelText('Link URL'), 'insta');
    const listbox = await screen.findByRole('listbox', {
      name: 'Platform Suggestions',
    });
    expect(listbox).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Link URL') as HTMLInputElement).value
      ).toContain('instagram')
    );
  });

  it('clears the field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Link URL');
    await user.type(input, 'hello');
    await user.click(screen.getByRole('button', { name: 'Clear Input' }));
    expect(input).toHaveValue('');
  });
});
