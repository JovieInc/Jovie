import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseFields } from './ReleaseFields';

describe('ReleaseFields', () => {
  it('labels the type and counts with singular and plural nouns', async () => {
    const { container, rerender } = render(
      <ReleaseFields
        releaseDate='2026-11-14'
        releaseType='single'
        totalTracks={1}
        platformCount={1}
      />
    );

    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('1 Track')).toBeInTheDocument();
    expect(screen.getByText('1 DSP')).toBeInTheDocument();
    expect(screen.queryByText('No Release Date')).toBeNull();
    await expectNoA11yViolations(container);

    rerender(
      <ReleaseFields
        releaseDate='2026-11-14'
        releaseType='album'
        totalTracks={12}
        platformCount={6}
      />
    );
    expect(screen.getByText('Album')).toBeInTheDocument();
    expect(screen.getByText('12 Tracks')).toBeInTheDocument();
    expect(screen.getByText('6 DSPs')).toBeInTheDocument();
  });

  it('says there is no release date and hides empty counts', async () => {
    const { container } = render(
      <ReleaseFields
        releaseDate={undefined}
        totalTracks={0}
        platformCount={0}
      />
    );

    expect(screen.getByText('No Release Date')).toBeInTheDocument();
    expect(screen.queryByText(/Track/)).toBeNull();
    expect(screen.queryByText(/DSP/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows an unmapped type as given and the reveal date', async () => {
    const { container } = render(
      <ReleaseFields
        releaseDate='2026-11-14'
        releaseType='remix-pack'
        revealDate='2026-11-01'
      />
    );

    expect(screen.getByText('remix-pack')).toBeInTheDocument();
    expect(screen.getByText('Reveals')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
