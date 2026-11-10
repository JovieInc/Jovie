import { describe, expect, it } from 'vitest';
import { resolveLibraryReviewStep } from '@/app/app/(shell)/library/LibrarySurface';

describe('resolveLibraryReviewStep', () => {
  const page = document.body;

  it('moves one item on J/K and one row of tiles on up/down in the grid', () => {
    expect(resolveLibraryReviewStep('j', page, 5)).toEqual({
      kind: 'move',
      delta: 1,
    });
    expect(resolveLibraryReviewStep('k', page, 5)).toEqual({
      kind: 'move',
      delta: -1,
    });
    expect(resolveLibraryReviewStep('ArrowDown', page, 5)).toEqual({
      kind: 'move',
      delta: 5,
    });
    expect(resolveLibraryReviewStep('ArrowUp', page, 5)).toEqual({
      kind: 'move',
      delta: -5,
    });
    expect(resolveLibraryReviewStep('ArrowLeft', page, 5)).toEqual({
      kind: 'move',
      delta: -1,
    });
    // Lists and tables move one row and leave left/right to scrolling.
    expect(resolveLibraryReviewStep('ArrowDown', page, null)).toEqual({
      kind: 'move',
      delta: 1,
    });
    expect(resolveLibraryReviewStep('ArrowRight', page, null)).toBeNull();
    expect(resolveLibraryReviewStep('End', page, null)).toEqual({
      kind: 'edge',
      to: 'last',
    });
  });

  it('plays on Space and inspects on Enter without stealing native controls', () => {
    const tile = document.createElement('button');
    tile.dataset.libraryItemFocus = '';
    const control = document.createElement('button');
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    const input = document.createElement('input');

    expect(resolveLibraryReviewStep(' ', page, 4)).toEqual({ kind: 'play' });
    expect(resolveLibraryReviewStep(' ', tile, 4)).toEqual({ kind: 'play' });
    expect(resolveLibraryReviewStep(' ', control, 4)).toBeNull();
    expect(resolveLibraryReviewStep('Enter', page, 4)).toEqual({
      kind: 'open',
    });
    expect(resolveLibraryReviewStep('Enter', tile, 4)).toBeNull();
    expect(resolveLibraryReviewStep('j', slider, 4)).toBeNull();
    expect(resolveLibraryReviewStep('j', input, 4)).toBeNull();
    expect(resolveLibraryReviewStep('ArrowLeft', input, 4)).toBeNull();
  });
});
