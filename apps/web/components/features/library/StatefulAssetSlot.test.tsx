import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryInspectorAssetSlots } from './LibraryInspectorAssetSlots';
import { StatefulAssetSlot } from './StatefulAssetSlot';

const baseSlot = {
  cardinality: 'single' as const,
  acquireMode: 'file' as const,
  testIdPrefix: 'library-artwork',
  objectTitle: 'Artwork',
  acquireLabel: 'Drop artwork',
  accept: 'image/jpeg',
};

describe('StatefulAssetSlot', () => {
  it('shows a drop zone only when the single-file slot is empty', () => {
    render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='empty'
        {...baseSlot}
        onFile={vi.fn()}
      />
    );
    expect(screen.getByTestId('library-artwork-dropzone')).toBeInTheDocument();
    expect(screen.queryByTestId('library-artwork-object')).toBeNull();
  });

  it('renders populated object UI with secondary replace and no drop zone', () => {
    const onFile = vi.fn();
    render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='populated'
        {...baseSlot}
        previewSrc='https://cdn.example.com/art.jpg'
        onFile={onFile}
      />
    );
    expect(screen.queryByTestId('library-artwork-dropzone')).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Replace'), {
      target: {
        files: [new File(['art'], 'cover.jpg', { type: 'image/jpeg' })],
      },
    });
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it('keeps add secondary on populated stems', () => {
    render(
      <StatefulAssetSlot
        kind='stems'
        occupancy='populated'
        cardinality='multi'
        acquireMode='action'
        testIdPrefix='library-stems'
        objectTitle='2 stem files'
        acquireLabel='Add stems'
        addHref='/app/releases/release-1/downloads'
      />
    );
    expect(screen.queryByTestId('library-stems-dropzone')).toBeNull();
    expect(screen.getByTestId('library-stems-add')).toHaveAttribute(
      'href',
      '/app/releases/release-1/downloads'
    );
  });
});

describe('LibraryInspectorAssetSlots', () => {
  const asset = (overrides: Partial<LibraryReleaseAsset> = {}) =>
    ({
      id: 'release-1',
      title: 'Take Me Over',
      artworkUrl: 'https://cdn.example.com/artwork.jpg',
      hasArtwork: true,
      ...overrides,
    }) as LibraryReleaseAsset;

  it('uses object UI for populated artwork and acquisition for empty kinds', () => {
    render(<LibraryInspectorAssetSlots asset={asset()} downloads={[]} />);
    expect(screen.getByTestId('library-artwork-object')).toBeInTheDocument();
    expect(screen.queryByTestId('library-artwork-dropzone')).toBeNull();
    expect(screen.getByTestId('library-video-acquisition')).toBeInTheDocument();
  });

  it('shows an artwork drop zone only when empty', () => {
    render(
      <LibraryInspectorAssetSlots
        asset={asset({ artworkUrl: null, hasArtwork: false })}
        downloads={[]}
      />
    );
    expect(screen.getByTestId('library-artwork-dropzone')).toBeInTheDocument();
  });
});
