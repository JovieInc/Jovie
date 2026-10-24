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
  OpportunityInboxRoute: ({
    initialView = 'needs',
  }: {
    initialView?: string;
  }) => <span data-testid='inbox-view'>{initialView}</span>,
}));

import { homeNavItem } from '@/components/features/dashboard/dashboard-nav/config';
import AppRootPage, { generateMetadata } from './page';

describe('Home route', () => {
  it('uses the canonical Home title and preserves the interview entry', async () => {
    expect(generateMetadata().title).toBe(homeNavItem.name);
    render(
      await AppRootPage({ searchParams: Promise.resolve({ interview: '1' }) })
    );
    expect(screen.getByTestId('interview')).toHaveTextContent('true');
  });
  it('defaults the signed-in home to Needs you', async () => {
    render(await AppRootPage());
    expect(screen.getByTestId('inbox-view')).toHaveTextContent('needs');
  });
});
