import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileQuickActions } from '@/features/profile/ProfileQuickActions';

describe('ProfileQuickActions', () => {
  it('marks the active action and routes pane taps through onModeSelect', () => {
    const onModeSelect = vi.fn();

    render(
      <ProfileQuickActions
        activeMode='tour'
        onModeSelect={onModeSelect}
        onBookClick={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'Tour' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(onModeSelect).toHaveBeenCalledWith('about');
  });

  it('opens booking from the Book action instead of changing panes', () => {
    const onModeSelect = vi.fn();
    const onBookClick = vi.fn();

    render(
      <ProfileQuickActions
        activeMode='profile'
        onModeSelect={onModeSelect}
        onBookClick={onBookClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    expect(onBookClick).toHaveBeenCalledOnce();
    expect(onModeSelect).not.toHaveBeenCalled();
  });
});
