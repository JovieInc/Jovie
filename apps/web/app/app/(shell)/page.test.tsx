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
vi.mock('./chat/DeferredChatPageClient', () => ({
  DeferredChatPageClient: () => <span data-testid='chat-home' />,
}));

import AppRootPage from './page';

describe('App Home', () => {
  it('opens on the chat composer, not the inbox empty state', async () => {
    render(await AppRootPage());
    expect(screen.getByTestId('chat-home')).toBeInTheDocument();
    expect(screen.getByTestId('interview')).toHaveTextContent('false');
  });

  it('keeps the interview entry on Home', async () => {
    render(
      await AppRootPage({ searchParams: Promise.resolve({ interview: '1' }) })
    );
    expect(screen.getByTestId('interview')).toHaveTextContent('true');
  });
});
