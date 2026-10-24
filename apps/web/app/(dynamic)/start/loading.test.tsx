import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_ENTRY_TITLE } from '@/lib/onboarding/empty-state';
import StartLoading from './loading';

describe('StartLoading', () => {
  it('exposes one page heading outside the aria-hidden skeleton', () => {
    render(<StartLoading />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: ONBOARDING_ENTRY_TITLE,
    });
    expect(heading).toHaveClass('sr-only');
    expect(screen.getByTestId('start-loading-intro')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(heading.closest('[aria-hidden="true"]')).toBeNull();
  });
});
