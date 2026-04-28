import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuggestionCard } from './SuggestionCard';

describe('SuggestionCard', () => {
  it('renders title, body, and action label', () => {
    render(
      <SuggestionCard
        title='Detroit listeners up 340%'
        body='A promoter reached out yesterday.'
        actionLabel='Review pitch'
      />
    );
    expect(screen.getByText('Detroit listeners up 340%')).toBeInTheDocument();
    expect(
      screen.getByText('A promoter reached out yesterday.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Review pitch/ })
    ).toBeInTheDocument();
  });

  it('disables the action button when no onAct is provided', () => {
    render(<SuggestionCard title='t' body='b' actionLabel='Go' />);
    expect(screen.getByRole('button', { name: /Go/ })).toBeDisabled();
  });

  it('fires onAct when the action button is clicked', () => {
    const onAct = vi.fn();
    render(
      <SuggestionCard title='t' body='b' actionLabel='Go' onAct={onAct} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Go/ }));
    expect(onAct).toHaveBeenCalledOnce();
  });

  it('hides the dismiss button when no onDismiss is supplied', () => {
    render(<SuggestionCard title='t' body='b' actionLabel='Go' />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('fires onDismiss with custom label when provided', () => {
    const onDismiss = vi.fn();
    render(
      <SuggestionCard
        title='t'
        body='b'
        actionLabel='Go'
        onDismiss={onDismiss}
        dismissLabel='Not now'
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
