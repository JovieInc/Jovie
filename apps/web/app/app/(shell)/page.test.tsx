import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/onboarding/OnboardingInterviewModal', () => ({
  OnboardingInterviewModal: ({
    initialRequested,
  }: {
    initialRequested: boolean;
  }) => <span data-testid='interview'>{String(initialRequested)}</span>,
}));
vi.mock('@/lib/queries/HydrateClient', () => ({
  HydrateClient: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/queries/server', () => ({ getDehydratedState: () => ({}) }));
vi.mock('./OpportunityInboxRoute', () => ({
  OpportunityInboxRoute: ({ initialView }: { initialView: string }) => (
    <span data-testid='inbox-view'>{initialView}</span>
  ),
}));

import AppRootPage from './page';

describe('Inbox direct route', () => {
  it('opens Done for you from its permanent history destination while preserving the interview entry', async () => {
    render(
      await AppRootPage({
        searchParams: Promise.resolve({ view: 'done', interview: '1' }),
      })
    );
    expect(screen.getByTestId('inbox-view')).toHaveTextContent('done');
    expect(screen.getByTestId('interview')).toHaveTextContent('true');
  });
  it('defaults the signed-in home to Needs you', async () => {
    render(await AppRootPage());
    expect(screen.getByTestId('inbox-view')).toHaveTextContent('needs');
  });
});
