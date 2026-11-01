import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreditList } from './CreditList';

describe('CreditList', () => {
  it('renders plain credit lines through the canonical conjunction formatter', () => {
    const { container } = render(<CreditList names={['Vigel', 'Tim White']} />);
    expect(screen.getByText('Vigel and Tim White')).toBeInTheDocument();
    expect(container.textContent).toBe('Vigel and Tim White');
  });

  it('formats three or more credits Oxford-less', () => {
    render(<CreditList names={['Vigel', 'Cosmic Gate', 'Tim White']} />);
    expect(
      screen.getByText('Vigel, Cosmic Gate and Tim White')
    ).toBeInTheDocument();
  });

  it('drops exact duplicate names and empty entries', () => {
    render(
      <CreditList names={['Vigel', ' Vigel ', '', 'Tim White', 'Tim White']} />
    );
    expect(screen.getByText('Vigel and Tim White')).toBeInTheDocument();
  });

  it('renders one credit as-is and preserves RTL names inside the line', () => {
    render(<CreditList names={['עופר לב']} />);
    expect(screen.getByText('עופר לב')).toBeInTheDocument();
  });

  it('renders the fallback when no names remain', () => {
    render(<CreditList names={[]} fallback='Solo Artist' />);
    expect(screen.getByText('Solo Artist')).toBeInTheDocument();
  });

  it('renders nothing when there are no names and no fallback', () => {
    const { container } = render(<CreditList names={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders each credit through renderName with clickable semantics', async () => {
    const onArtistClick = vi.fn();
    render(
      <CreditList
        names={['Vigel', 'Tim White']}
        renderName={name => (
          <button type='button' onClick={() => onArtistClick(name)}>
            {name}
          </button>
        )}
      />
    );
    const vigel = screen.getByRole('button', { name: 'Vigel' });
    const tim = screen.getByRole('button', { name: 'Tim White' });
    expect(vigel).toBeInTheDocument();
    expect(tim).toBeInTheDocument();

    await userEvent.click(tim);
    expect(onArtistClick).toHaveBeenCalledExactlyOnceWith('Tim White');

    // Exactly one credit button per rendered name; the conjunction stays a
    // non-interactive literal between them.
    expect(document.querySelectorAll('button')).toHaveLength(2);
  });

  it('routes the fallback through renderName so it stays clickable', async () => {
    const onArtistClick = vi.fn();
    render(
      <CreditList
        names={[]}
        fallback='Solo Artist'
        renderName={name => (
          <button type='button' onClick={() => onArtistClick(name)}>
            {name}
          </button>
        )}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Solo Artist' }));
    expect(onArtistClick).toHaveBeenCalledExactlyOnceWith('Solo Artist');
  });

  it('applies literalClassName to separator spans only', () => {
    render(
      <CreditList
        names={['Vigel', 'Cosmic Gate', 'Tim White']}
        renderName={name => <button type='button'>{name}</button>}
        literalClassName='text-white/70'
      />
    );
    const separators = Array.from(
      document.querySelectorAll("span[class='text-white/70']")
    );
    expect(separators.map(node => node.textContent)).toEqual([', ', ' and ']);
  });
});
