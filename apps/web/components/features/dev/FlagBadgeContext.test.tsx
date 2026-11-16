import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FlagBadgeProvider, useFlagBadges } from './FlagBadgeContext';

const KEY = '__dev_flag_badges';

function Consumer() {
  const flagBadges = useFlagBadges();
  if (!flagBadges) return <p>No provider</p>;
  return (
    <button
      type='button'
      aria-pressed={flagBadges.showBadges}
      onClick={flagBadges.toggleBadges}
    >
      Flag badges
    </button>
  );
}

describe('FlagBadgeContext certificate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts off and toggles badges, persisting each choice', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FlagBadgeProvider>
        <Consumer />
      </FlagBadgeProvider>
    );

    const toggle = screen.getByRole('button', { name: 'Flag badges' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(KEY)).toBe('1');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(KEY)).toBe('0');
    await expectNoA11yViolations(container);
  });

  it('reads a saved preference on mount', async () => {
    localStorage.setItem(KEY, '1');
    const { container } = render(
      <FlagBadgeProvider>
        <Consumer />
      </FlagBadgeProvider>
    );

    expect(screen.getByRole('button', { name: 'Flag badges' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('falls back to off when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <FlagBadgeProvider>
        <Consumer />
      </FlagBadgeProvider>
    );

    expect(screen.getByRole('button', { name: 'Flag badges' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('returns null outside the provider', async () => {
    const { container } = render(
      <div dir='rtl'>
        <Consumer />
      </div>
    );

    expect(screen.getByText('No provider')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
