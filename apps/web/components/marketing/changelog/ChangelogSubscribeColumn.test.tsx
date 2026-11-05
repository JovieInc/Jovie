import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => <div data-testid='turnstile' />,
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

import { ChangelogSubscribeColumn } from './ChangelogSubscribeColumn';

describe('ChangelogSubscribeColumn', () => {
  it('composes the canonical signup and exposes the feed alternatives', () => {
    const { container } = render(<ChangelogSubscribeColumn />);

    expect(container.firstElementChild).toHaveClass('changelog-subscribe');
    expect(container.querySelector('form')).toBeInTheDocument();

    const rss = screen.getByRole('link', { name: 'RSS Feed' });
    expect(rss).toHaveAttribute('href', '/changelog/feed.xml');
    expect(rss).toHaveClass('changelog-subscribe__alt');

    const json = screen.getByRole('link', { name: 'JSON Feed' });
    expect(json).toHaveAttribute('href', '/changelog/feed.json');
    expect(json).toHaveClass('changelog-subscribe__alt');
  });

  it('loads the security check only after the visitor touches the form', () => {
    render(<ChangelogSubscribeColumn />);
    expect(screen.queryByTestId('turnstile')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('textbox'));
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();
  });
});
