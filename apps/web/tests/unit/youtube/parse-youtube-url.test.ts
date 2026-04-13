import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl } from '@/lib/youtube/parse';

describe('parseYouTubeUrl', () => {
  it('parses youtube.com/watch?v= URLs', () => {
    const result = parseYouTubeUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('parses youtu.be/ short URLs', () => {
    const result = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
  });

  it('parses youtube.com/embed/ URLs', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    });
  });

  it('parses youtube.com/shorts/ URLs', () => {
    const result = parseYouTubeUrl(
      'https://www.youtube.com/shorts/dQw4w9WgXcQ'
    );
    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    });
  });

  it('handles URLs with extra query params', () => {
    const result = parseYouTubeUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
    );
    expect(result?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('returns null for invalid URLs', () => {
    expect(parseYouTubeUrl('https://example.com/video')).toBeNull();
    expect(parseYouTubeUrl('not-a-url')).toBeNull();
    expect(parseYouTubeUrl('https://vimeo.com/12345')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseYouTubeUrl('')).toBeNull();
  });
});
