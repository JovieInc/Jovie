import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HEADROOM_SCHEMA } from '@/lib/ovie/home/github-headroom';
import { GithubHeadroomTile } from './GithubHeadroomTile';

const NOW = Date.parse('2026-10-25T06:30:00.000Z');

describe('GithubHeadroomTile', () => {
  it('reads Unknown with no data', () => {
    render(<GithubHeadroomTile report={null} nowMs={NOW} />);
    expect(screen.getByTestId('github-headroom-value')).toHaveTextContent(
      'Unknown'
    );
    expect(screen.getByRole('img', { name: 'No status' })).toBeInTheDocument();
  });
  it('is red when any sample was empty', () => {
    render(
      <GithubHeadroomTile
        nowMs={NOW}
        report={{
          schema: HEADROOM_SCHEMA,
          generatedAt: '',
          windows: [
            {
              bucket: 'core',
              windowStart: '2026-10-25T06:00:00.000Z',
              limit: 5000,
              samples: 40,
              minRemaining: 0,
              medianRemaining: 800,
              exhaustedSamples: 2,
              emptyShare: 0.05,
            },
          ],
        }}
      />
    );
    expect(screen.getByRole('img', { name: 'Problem' })).toBeInTheDocument();
    expect(screen.getByTestId('github-headroom-value')).toHaveTextContent(
      '0 / 5,000'
    );
  });
});
