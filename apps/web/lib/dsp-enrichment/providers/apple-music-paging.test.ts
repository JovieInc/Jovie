import { describe, expect, it } from 'vitest';
import { nextAlbumsPath } from './apple-music-paging';

describe('nextAlbumsPath', () => {
  it('follows the cursor and keeps the page size', () => {
    expect(
      nextAlbumsPath('/v1/catalog/us/artists/1/albums?offset=100', 100)
    ).toBe('/catalog/us/artists/1/albums?offset=100&limit=100');
  });

  it('keeps a page size the cursor already carries', () => {
    expect(
      nextAlbumsPath('/v1/catalog/us/artists/1/albums?offset=25&limit=25', 100)
    ).toBe('/catalog/us/artists/1/albums?offset=25&limit=25');
  });

  it('stops on the last page or a cursor that is not an API path', () => {
    expect(nextAlbumsPath(undefined, 100)).toBeNull();
    expect(nextAlbumsPath('https://evil.example/v1/x', 100)).toBeNull();
  });
});
