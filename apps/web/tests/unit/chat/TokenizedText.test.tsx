import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenizedText } from '@/components/jovie/components/TokenizedText';
import { fastRender } from '@/tests/utils/fast-render';

describe('TokenizedText', () => {
  it('renders skill tokens as rich transcript chips', () => {
    fastRender(
      <TokenizedText content='/skill:generateAlbumArt please' tone='onLight' />
    );

    expect(screen.getByTestId('transcript-skill-chip')).toHaveTextContent(
      'Generate album art'
    );
    expect(screen.queryByText('/skill:generateAlbumArt')).toBeNull();
    expect(screen.queryByText('generateAlbumArt')).toBeNull();
  });

  it('renders entity tokens as rich chips instead of raw wire tokens', () => {
    fastRender(
      <TokenizedText
        content='Update @release:rel_1[Take Me Over] before Friday'
        tone='onDark'
      />
    );

    const chip = screen.getByTestId('entity-chip');
    expect(chip).toHaveTextContent('Take Me Over');
    expect(chip).toHaveAttribute('data-entity-kind', 'release');
    expect(chip).toHaveAttribute('data-entity-tone', 'onDark');
    expect(screen.queryByText('@release:rel_1[Take Me Over]')).toBeNull();
  });

  it('uses light-surface chip tone inside user bubbles', () => {
    fastRender(
      <TokenizedText
        content='Use @artist:artist_1[Tim White] for this update'
        tone='onLight'
      />
    );

    const chip = screen.getByTestId('entity-chip');
    expect(chip).toHaveAttribute('data-entity-kind', 'artist');
    expect(chip).toHaveAttribute('data-entity-tone', 'onLight');
    expect(chip.className).toContain('#111216');
  });
});
