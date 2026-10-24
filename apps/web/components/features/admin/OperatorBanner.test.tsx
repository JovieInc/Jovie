import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorBanner } from './OperatorBanner';

vi.mock('@/lib/env-client', () => ({ env: { IS_E2E: false } }));
vi.mock('@/lib/queries', () => ({
  useEnvHealthQuery: () => ({ data: undefined }),
}));

describe('OperatorBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders issues on the Noir surface tokens, not raw amber', () => {
    render(<OperatorBanner initialIssues={['A missing', 'B missing', 'C']} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('A missing; B missing');
    expect(banner).toHaveClass('bg-surface-2', 'text-primary-token');
    expect(banner.className).not.toMatch(/amber-/);
    expect(screen.getByText('+1 more')).toHaveClass('text-secondary-token');
  });

  it('dismisses for the session', () => {
    render(<OperatorBanner initialIssues={['A missing']} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Environment Warning' })
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sessionStorage.getItem('operator-banner-dismissed')).toBe('true');
  });

  it('renders nothing without issues', () => {
    render(<OperatorBanner />);
    expect(screen.queryByTestId('operator-banner')).toBeNull();
  });
});
