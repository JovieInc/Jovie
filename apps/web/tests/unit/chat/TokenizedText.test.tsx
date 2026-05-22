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
});
