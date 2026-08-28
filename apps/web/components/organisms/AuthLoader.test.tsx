import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';

vi.mock('@/components/atoms/JovieMarkElectric', () => ({
  JovieMarkElectric: () => <div data-testid='jovie-mark-electric' />,
}));

import { AuthLoader } from './AuthLoader';

const LOADING_MESSAGE_DELAY_MS = 2000;

function layoutBearingSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('*'))
    .map(element =>
      [
        element.tagName,
        element.getAttribute('role') ?? '',
        element.getAttribute('data-testid') ?? '',
        (element.getAttribute('class') ?? '').replace(/opacity-\d+/g, ''),
      ].join('|')
    )
    .join('\n');
}

describe('AuthLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes exactly one polite busy loading owner', () => {
    const { container } = render(<AuthLoader />);
    const owner = screen.getByRole('status', { name: 'Loading' });

    expect(owner).toHaveAttribute('aria-busy', 'true');
    expect(owner).toHaveAttribute('aria-live', 'polite');
    expect(owner).toHaveAttribute('data-testid', 'auth-loader');
    expect(screen.getByTestId('jovie-mark-electric')).toBeInTheDocument();
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
    expect(owner.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps the delayed visual message in layout and only changes opacity', () => {
    const { container } = render(<AuthLoader />);
    const message = container.querySelector('p');

    expect(message).toHaveClass(
      'text-xs',
      'text-tertiary-token',
      'transition-opacity',
      'duration-subtle',
      'opacity-0'
    );
    expect(message).toHaveTextContent('Loading...');

    const before = layoutBearingSignature(container);

    act(() => {
      vi.advanceTimersByTime(LOADING_MESSAGE_DELAY_MS);
    });

    expect(message).toHaveClass('opacity-100');
    expect(message).not.toHaveClass('opacity-0');
    expect(layoutBearingSignature(container)).toEqual(before);
    expect(container.querySelectorAll('*')).toHaveLength(
      before.split('\n').length
    );
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
  });
});
