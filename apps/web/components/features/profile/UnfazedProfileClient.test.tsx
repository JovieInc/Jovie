import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UnfazedProfileClient } from './UnfazedProfileClient';

vi.mock('@/components/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./PublicProfileFixture', () => ({
  PublicProfileFixture: ({
    longName,
    state,
  }: {
    longName?: boolean;
    state?: string;
  }) => (
    <div data-testid='public-profile-fixture'>
      {longName ? 'long-name' : 'short-name'}:{state}
    </div>
  ),
}));

describe('UnfazedProfileClient', () => {
  it('mounts the deterministic fixture after hydration', async () => {
    render(<UnfazedProfileClient />);

    expect(
      await screen.findByTestId('public-profile-fixture')
    ).toHaveTextContent('short-name:unclaimed');
  });
});
