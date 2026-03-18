import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid='content-surface-card' className={className}>
      {children}
    </div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import { GetStartedChecklistCard } from '@/features/dashboard/organisms/GetStartedChecklistCard';

describe('GetStartedChecklistCard', () => {
  const userId = 'user-456';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders 5 checklist items', () => {
    render(<GetStartedChecklistCard userId={userId} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
  });

  it('shows progress bar', () => {
    const { container } = render(<GetStartedChecklistCard userId={userId} />);
    expect(container.querySelector('.bg-surface-2')).toBeInTheDocument();
  });

  it('shows "Later" dismiss button', () => {
    render(<GetStartedChecklistCard userId={userId} />);
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
  });

  it('toggling an item updates localStorage and shows strikethrough', () => {
    render(<GetStartedChecklistCard userId={userId} />);

    const toggleButtons = screen.getAllByRole('button', {
      name: /mark .+ as done/i,
    });
    const firstToggle = toggleButtons[0];
    fireEvent.click(firstToggle);

    const stored = localStorage.getItem(`jovie:getting-started:${userId}`);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as string[];
    expect(parsed.length).toBeGreaterThan(0);

    // After toggling, there should be a line-through element
    const strikethrough = document.querySelector('.line-through');
    expect(strikethrough).toBeInTheDocument();
  });

  it('returns null when dismissed (localStorage dismiss key set with future timestamp)', () => {
    const futureTs = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(
      `jovie:getting-started-dismissed:${userId}`,
      String(futureTs)
    );
    const { container } = render(<GetStartedChecklistCard userId={userId} />);
    expect(
      container.querySelector('[data-testid="content-surface-card"]')
    ).toBeNull();
  });

  it('returns null when all items completed', () => {
    const allItems = [
      'share-instagram',
      'spotify-bio',
      'qr-code',
      'invite-artist',
      'connect-venmo',
    ];
    localStorage.setItem(
      `jovie:getting-started:${userId}`,
      JSON.stringify(allItems)
    );
    const { container } = render(<GetStartedChecklistCard userId={userId} />);
    expect(
      container.querySelector('[data-testid="content-surface-card"]')
    ).toBeNull();
  });
});
