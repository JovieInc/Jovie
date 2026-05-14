import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_DEMO_VIDEO_URL = process.env.DEMO_VIDEO_URL;
const ORIGINAL_DEMO_VIDEO_POSTER_URL = process.env.DEMO_VIDEO_POSTER_URL;

async function loadModule() {
  vi.resetModules();
  return import('@/lib/demo-video');
}

afterEach(() => {
  if (ORIGINAL_DEMO_VIDEO_URL === undefined) {
    delete process.env.DEMO_VIDEO_URL;
  } else {
    process.env.DEMO_VIDEO_URL = ORIGINAL_DEMO_VIDEO_URL;
  }

  if (ORIGINAL_DEMO_VIDEO_POSTER_URL === undefined) {
    delete process.env.DEMO_VIDEO_POSTER_URL;
  } else {
    process.env.DEMO_VIDEO_POSTER_URL = ORIGINAL_DEMO_VIDEO_POSTER_URL;
  }
});

describe('demo video helpers', () => {
  it('uses the generated public Playwright asset by default', async () => {
    delete process.env.DEMO_VIDEO_URL;

    const { DEMO_VIDEO_PUBLIC_PATH, getDemoVideoUrl } = await loadModule();

    expect(getDemoVideoUrl()).toBe(DEMO_VIDEO_PUBLIC_PATH);
  });

  it('allows a hosted demo video override', async () => {
    process.env.DEMO_VIDEO_URL = 'https://cdn.example.com/jovie-demo.mp4';

    const { getDemoVideoUrl } = await loadModule();

    expect(getDemoVideoUrl()).toBe('https://cdn.example.com/jovie-demo.mp4');
  });

  it('uses the generated public poster by default', async () => {
    delete process.env.DEMO_VIDEO_POSTER_URL;

    const { DEMO_POSTER_PUBLIC_PATH, getDemoVideoPosterUrl } =
      await loadModule();

    expect(getDemoVideoPosterUrl()).toBe(DEMO_POSTER_PUBLIC_PATH);
  });

  it('allows a hosted demo poster override', async () => {
    process.env.DEMO_VIDEO_POSTER_URL =
      'https://cdn.example.com/jovie-demo-poster.jpg';

    const { getDemoVideoPosterUrl } = await loadModule();

    expect(getDemoVideoPosterUrl()).toBe(
      'https://cdn.example.com/jovie-demo-poster.jpg'
    );
  });

  it('uses the download proxy only for hosted assets', async () => {
    const { getDemoVideoDownloadHref } = await loadModule();

    expect(getDemoVideoDownloadHref('/demo/jovie-demo.mp4')).toBe(
      '/demo/jovie-demo.mp4'
    );
    expect(
      getDemoVideoDownloadHref('https://cdn.example.com/jovie-demo.mp4')
    ).toBe('/api/demo/download');
  });
});
