import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => <div data-testid='turnstile' />,
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

import { ChangelogSubscribeColumn } from './ChangelogSubscribeColumn';

describe('ChangelogSubscribeColumn', () => {
  it('composes the canonical signup, set flush left for the page header', () => {
    const { container } = render(<ChangelogSubscribeColumn />);

    expect(container.firstElementChild).toHaveClass('changelog-subscribe');
    expect(container.querySelector('form')).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass('items-start');
    expect(
      screen.getByRole('heading', { name: 'Get updates' })
    ).toBeInTheDocument();
  });

  it('loads the security check only after the visitor touches the form', () => {
    render(<ChangelogSubscribeColumn />);
    expect(screen.queryByTestId('turnstile')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('textbox'));
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();
  });
});
