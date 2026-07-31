import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ArtistArt,
  ReleaseArt,
} from '@/components/jovie/components/picker-rows';
import type { EntityRef } from '@/lib/commands/entities';

vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & {
      readonly fill?: boolean;
      readonly unoptimized?: boolean;
    }
  ) => {
    const { fill: _fill, unoptimized: _unoptimized, ...imageProps } = props;
    return <img alt='' {...imageProps} />;
  },
}));

describe('picker row artwork', () => {
  it('uses the undecorated thumbnail frame for release search results', () => {
    const entity: EntityRef = {
      id: 'release-1',
      kind: 'release',
      label: 'Take Me Over',
      thumbnail: 'https://cdn.example.com/release.jpg',
    };
    const { container } = render(<ReleaseArt entity={entity} />);
    const frame = container.firstElementChild as HTMLElement;

    expect(frame).toHaveAttribute('data-artwork-frame', 'thumbnail');
    expect(frame).toHaveClass(
      'rounded-xs',
      'border-0',
      'outline-none',
      'shadow-none'
    );
  });

  it('preserves circular artist avatars', () => {
    const entity: EntityRef = {
      id: 'artist-1',
      kind: 'artist',
      label: 'Tim White',
      thumbnail: 'https://cdn.example.com/artist.jpg',
    };
    const { container } = render(<ArtistArt entity={entity} />);
    const frame = container.firstElementChild as HTMLElement;

    expect(frame).not.toHaveAttribute('data-artwork-frame');
    expect(frame).toHaveClass('system-b-picker-art-round');
  });
});
