import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
