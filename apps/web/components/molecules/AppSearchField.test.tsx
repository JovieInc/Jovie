import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppSearchField } from './AppSearchField';

describe('AppSearchField', () => {
  it('keeps the container ring keyboard-only while preserving input focus feedback', () => {
    const { container } = render(
      <AppSearchField ariaLabel='Search library' onChange={vi.fn()} value='' />
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search library' })
    ).toBeVisible();
    expect(container.firstElementChild).toHaveClass(
      'focus-within:border-(--linear-border-focus)',
      'focus-within:bg-surface-0',
      'has-[:focus-visible]:ring-2',
      'has-[:focus-visible]:ring-ring/14'
    );
    expect(container.firstElementChild?.className).not.toContain(
      'focus-within:ring-'
    );
  });
});
