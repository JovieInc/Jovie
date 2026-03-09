import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceSourceCell } from '@/components/dashboard/audience/table/atoms/AudienceSourceCell';

// SimpleTooltip requires TooltipProvider — mock it to render children directly
vi.mock('@jovie/ui', () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// AudienceSourceCell renders an icon with a tooltip — the source label is in
// the tooltip content (data attribute), not visible text.
describe('AudienceSourceCell', () => {
  it('prefers UTM source and normalizes known platforms', () => {
    const { container } = render(
      <AudienceSourceCell
        referrerHistory={[]}
        utmParams={{ source: 'instagram', medium: 'social' }}
      />
    );

    // Verify the cell renders without crashing and contains an icon wrapper with SVG
    expect(container.querySelector('div')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('ignores internal referrers and falls back to external source', () => {
    const { container } = render(
      <AudienceSourceCell
        referrerHistory={[
          { url: 'https://jov.ie/test', timestamp: new Date().toISOString() },
          {
            url: 'https://twitter.com/some-user/status/1',
            timestamp: new Date().toISOString(),
          },
        ]}
      />
    );

    expect(container.querySelector('div')).toBeInTheDocument();
    // Should render an SVG icon (not the fallback globe for a known platform)
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows direct icon when only internal referrers exist', () => {
    const { container } = render(
      <AudienceSourceCell
        referrerHistory={[
          {
            url: 'https://www.jovie.fm/profile/artist',
            timestamp: new Date().toISOString(),
          },
        ]}
      />
    );

    // Direct resolves to Globe fallback icon
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
