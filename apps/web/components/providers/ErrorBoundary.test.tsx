import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: vi.fn(),
  getUserFriendlyErrorMessage: vi.fn(),
  isUserFacingError: () => false,
}));

function BrokenChild(): never {
  throw new Error('Failed to load');
}

afterEach(() => vi.restoreAllMocks());

it('renders a sentence-case error heading and a reload action after a child fails', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary showToast={false}>
      <BrokenChild />
    </ErrorBoundary>
  );

  expect(
    screen.getByRole('heading', { name: 'Something went wrong' })
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeVisible();
});
