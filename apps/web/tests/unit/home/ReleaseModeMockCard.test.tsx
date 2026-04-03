import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_HERO_RELEASE_MOCK,
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
} from '@/features/home/home-surface-seed';
import { ReleaseModeMockCard } from '@/features/home/ReleaseModeMockCard';

vi.mock('@/features/home/HomepageLabelLogoMark', () => ({
  HomepageLabelLogoMark: ({ partner }: { partner: string }) => (
    <div data-testid={`label-logo-${partner}`}>{partner}</div>
  ),
}));

describe('ReleaseModeMockCard', () => {
  it('renders the presave countdown mock state', () => {
    render(
      <ReleaseModeMockCard release={HOME_HERO_RELEASE_MOCK} variant='compact' />
    );

    expect(screen.getByText('Countdown Presave')).toBeInTheDocument();
    expect(screen.getAllByText('Afterlight').length).toBeGreaterThan(0);
    expect(screen.getByText('Presave is open')).toBeInTheDocument();
    expect(screen.getAllByText('Presave').length).toBeGreaterThan(0);
    expect(screen.getByTestId('label-logo-orchard')).toBeInTheDocument();
  });

  it('renders the live smart link mock state', () => {
    render(
      <ReleaseModeMockCard
        release={HOME_RELEASE_DESTINATION_LIVE_MOCK}
        variant='comparison'
      />
    );

    expect(screen.getByText('Live Smart Link')).toBeInTheDocument();
    expect(screen.getAllByText('Take Me Over').length).toBeGreaterThan(0);
    expect(screen.getByText('Streaming everywhere now')).toBeInTheDocument();
    expect(screen.getByTestId('label-logo-umg')).toBeInTheDocument();
  });
});
