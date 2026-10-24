import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpdateAvailablePillView } from '@/components/atoms/UpdateAvailablePill';

describe('UpdateAvailablePillView', () => {
  it('shows a non-actionable downloading state', () => {
    render(
      <UpdateAvailablePillView state='downloading' onClick={() => undefined} />
    );

    const pill = screen.getByRole('button', { name: 'Downloading update' });
    expect(pill).toBeDisabled();
    expect(pill).toHaveAttribute('aria-busy', 'true');
    expect(pill).toHaveTextContent('Downloading…');
    expect(pill.querySelector('.animate-spin')).toBeNull();
    expect(pill.className).toContain('min-w-24');
    expect(pill.className).not.toMatch(/(^|\s)w-24(\s|$)/);
  });

  it('offers restart with the canonical focus ring once the update is ready', () => {
    const onClick = vi.fn();
    render(
      <UpdateAvailablePillView state='ready-to-restart' onClick={onClick} />
    );

    const pill = screen.getByRole('button', { name: 'Ready to restart' });
    expect(pill).toBeEnabled();
    expect(pill).toHaveAttribute('aria-busy', 'false');
    expect(pill).toHaveTextContent('Restart');
    expect(pill).toHaveClass('min-w-24', 'rounded-full');
    expect(pill.className).toContain('focus-visible:ring-focus/30');

    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the web update label distinct from desktop restart', () => {
    const onClick = vi.fn();
    render(<UpdateAvailablePillView state='web-ready' onClick={onClick} />);

    const pill = screen.getByRole('button', { name: 'Update available' });
    expect(pill).toBeEnabled();
    expect(pill).toHaveTextContent('Update');

    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
