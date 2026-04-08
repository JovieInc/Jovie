import { describe, expect, it } from 'vitest';
import { extractJsonPayload } from '@/lib/playlists/extract-json-payload';

describe('extractJsonPayload', () => {
  it('returns raw JSON unchanged when no fence is present', () => {
    expect(extractJsonPayload('  {"title":"Playlist"}  ')).toBe(
      '{"title":"Playlist"}'
    );
  });

  it('extracts JSON inside a fenced markdown block', () => {
    const response = [
      'Here is the payload:',
      '```json',
      '{"title":"Playlist"}',
      '```',
    ].join('\n');

    expect(extractJsonPayload(response)).toBe('{"title":"Playlist"}');
  });

  it('extracts content from an unlabeled fenced block', () => {
    const response = ['```', '["a","b","c"]', '```'].join('\n');
    expect(extractJsonPayload(response)).toBe('["a","b","c"]');
  });
});
