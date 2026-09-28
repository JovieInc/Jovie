import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeaturedArtistsSection } from './FeaturedArtistsSection';

describe('FeaturedArtistsSection', () => {
  it('exposes a Title Case featured creators landmark', () => {
    render(
      <FeaturedArtistsSection
        creators={[
          {
            id: '1',
            handle: 'example-artist',
            name: 'Example Artist',
            src: '/apple-touch-icon.png',
          },
        ]}
      />
    );

    expect(
      screen.getByRole('region', { name: 'Featured Creators' })
    ).toBeInTheDocument();
  });
});

describe('VirtualizedCreatorsRow virtualized window under React Compiler', () => {
  it('opts the virtualizer reader out of memoization (JOV-6702)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/organisms/FeaturedArtistsSection.tsx'),
      'utf8'
    );
    const body = source.slice(
      source.indexOf('function VirtualizedCreatorsRow')
    );
    expect(body.slice(0, body.indexOf('useVirtualizer('))).toContain(
      "'use no memo';"
    );
  });
});
