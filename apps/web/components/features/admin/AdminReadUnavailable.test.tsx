import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminReadUnavailable } from './AdminReadUnavailable';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('AdminReadUnavailable', () => {
  beforeEach(() => vi.clearAllMocks());
  it('announces unavailable data without implying an empty observation', () => {
    render(<AdminReadUnavailable message='Spend is unknown.' />);
    expect(screen.getByRole('status')).toHaveTextContent('Spend is unknown.');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it('re-reads the current route from the keyboard and retains the retry control', async () => {
    const user = userEvent.setup();
    render(<AdminReadUnavailable message='Flags could not be read.' />);
    await user.tab();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Retry' })).toBe(retry);
    expect(retry).toHaveFocus();
  });
});
