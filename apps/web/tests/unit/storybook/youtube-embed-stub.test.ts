import { afterEach, describe, expect, it } from 'vitest';
import { stubYouTubeEmbeds } from '../../../.storybook/youtube-embed-stub';

const EMBED = 'https://www.youtube-nocookie.com/embed/abc123?rel=0';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

describe('Storybook YouTube embed stub', () => {
  it('swaps an embed src for a local srcdoc and keeps the address readable', () => {
    cleanup = stubYouTubeEmbeds();
    const frame = document.createElement('iframe');
    frame.setAttribute('src', EMBED);

    expect(frame.getAttribute('src')).toBeNull();
    expect(frame.dataset.stubbedSrc).toBe(EMBED);
    expect(frame.getAttribute('srcdoc')).toContain('Video preview');
  });

  it('leaves other attributes and other origins alone', () => {
    cleanup = stubYouTubeEmbeds();
    const frame = document.createElement('iframe');
    frame.setAttribute('src', 'https://example.com/page');
    frame.setAttribute('title', 'Other');

    expect(frame.getAttribute('src')).toBe('https://example.com/page');
    expect(frame.getAttribute('title')).toBe('Other');
    expect(frame.dataset.stubbedSrc).toBeUndefined();
  });

  it('holds the load event of a stubbed frame only when asked', () => {
    cleanup = stubYouTubeEmbeds({ holdLoad: true });
    const stubbed = document.createElement('iframe');
    stubbed.setAttribute('src', EMBED);
    const other = document.createElement('iframe');
    document.body.append(stubbed, other);

    const seen: string[] = [];
    stubbed.addEventListener('load', () => seen.push('stubbed'));
    other.addEventListener('load', () => seen.push('other'));
    stubbed.dispatchEvent(new Event('load'));
    other.dispatchEvent(new Event('load'));

    expect(seen).toEqual(['other']);
  });

  it('restores setAttribute and the load event on cleanup', () => {
    const restore = stubYouTubeEmbeds({ holdLoad: true });
    restore();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    frame.setAttribute('src', EMBED);

    let loaded = false;
    frame.addEventListener('load', () => {
      loaded = true;
    });
    frame.dispatchEvent(new Event('load'));

    expect(frame.getAttribute('src')).toBe(EMBED);
    expect(frame.dataset.stubbedSrc).toBeUndefined();
    expect(loaded).toBe(true);
  });
});
