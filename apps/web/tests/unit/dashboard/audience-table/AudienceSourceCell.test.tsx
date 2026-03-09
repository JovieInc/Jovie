import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceSourceCell } from '@/components/dashboard/audience/table/atoms/AudienceSourceCell';

describe('AudienceSourceCell', () => {
  it('prefers UTM source and normalizes known platforms', () => {
    render(
      <AudienceSourceCell
        referrerHistory={[]}
        utmParams={{ source: 'instagram', medium: 'social' }}
      />
    );

    expect(screen.getByText('Instagram / social')).toBeInTheDocument();
  });

  it('ignores internal referrers and falls back to external source', () => {
    render(
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

    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('shows direct when only internal referrers exist', () => {
    render(
      <AudienceSourceCell
        referrerHistory={[
          {
            url: 'https://www.jovie.fm/profile/artist',
            timestamp: new Date().toISOString(),
          },
        ]}
      />
    );

    expect(screen.getByText('Direct')).toBeInTheDocument();
  });
});
