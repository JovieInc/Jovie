import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({ isTest: false, isE2E: false }));

vi.mock('@/lib/env-client', () => ({
  env: {
    get IS_TEST() {
      return state.isTest;
    },
    get IS_E2E() {
      return state.isE2E;
    },
  },
}));
vi.mock('@/components/feedback', () => ({
  FeedbackProvider: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='feedback-provider'>{children}</div>
  ),
}));
vi.mock('./JovieAnalytics', () => ({
  JovieAnalytics: () => <span data-testid='jovie-analytics' hidden />,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicAnalytics() {
      return <span data-testid='vercel-analytics' hidden />;
    },
}));

import { LazyProviders } from './LazyProviders';

describe('LazyProviders', () => {
  beforeEach(() => {
    state.isTest = false;
    state.isE2E = false;
  });

  it('wraps children in feedback and mounts both analytics layers by default', async () => {
    const { container } = render(
      <LazyProviders>
        <main>Page content</main>
      </LazyProviders>
    );

    expect(screen.getByTestId('feedback-provider')).toContainElement(
      screen.getByRole('main')
    );
    expect(screen.getByTestId('jovie-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('vercel-analytics')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps identity analytics but drops page analytics when disabled', async () => {
    const { container } = render(
      <LazyProviders enableAnalytics={false}>
        <main>Page content</main>
      </LazyProviders>
    );

    expect(screen.getByTestId('jovie-analytics')).toBeInTheDocument();
    expect(screen.queryByTestId('vercel-analytics')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['test', { isTest: true, isE2E: false }],
    ['e2e', { isTest: false, isE2E: true }],
  ])('mounts no analytics in a passive %s runtime', async (_label, runtime) => {
    Object.assign(state, runtime);
    const { container } = render(
      <LazyProviders>
        <main dir='rtl' lang='ar'>
          محتوى الصفحة
        </main>
      </LazyProviders>
    );

    expect(screen.getByRole('main')).toHaveTextContent('محتوى الصفحة');
    expect(screen.queryByTestId('jovie-analytics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vercel-analytics')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
