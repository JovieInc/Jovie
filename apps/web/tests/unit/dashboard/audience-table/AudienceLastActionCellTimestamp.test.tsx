import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceLastActionCell } from '@/components/organisms/table';

describe('AudienceLastActionCell with lastSeenAt', () => {
  it('renders action label with capitalized first letter', () => {
    render(
      <AudienceLastActionCell actions={[{ label: 'clicked spotify link' }]} />
    );
    expect(screen.getByText('Clicked Spotify Link')).toBeInTheDocument();
  });

  it('renders relative time when lastSeenAt is provided', () => {
    const recentDate = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    render(
      <AudienceLastActionCell
        actions={[{ label: 'Visited profile' }]}
        lastSeenAt={recentDate}
      />
    );
    // Should show the action label
    expect(screen.getByText('Visited Profile')).toBeInTheDocument();
    // Should show a dot separator between action and time
    expect(screen.getByText('·')).toBeInTheDocument();
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  it('renders time only when no actions but lastSeenAt exists', () => {
    const recentDate = new Date(Date.now() - 60 * 1000).toISOString();
    const { container } = render(
      <AudienceLastActionCell actions={[]} lastSeenAt={recentDate} />
    );
    // Should render something (the time)
    expect(container.textContent).not.toBe('');
  });

  it('renders nothing when no actions and no lastSeenAt', () => {
    const { container } = render(<AudienceLastActionCell actions={[]} />);
    expect(container.textContent).toBe('');
  });
});
