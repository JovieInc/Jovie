import { fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DesktopSurfaceImage,
  PROFILE_DESKTOP_SURFACE_MEDIA_QUERY,
} from './DesktopSurfaceImage';

const HERO_URL =
  'https://i.scdn.co/image/ab6761610000e5ebbf20a0a1d3bbd4018b4853e6';
const HERO_SIZES = '(max-width: 1536px) 60vw, 900px';

function renderDocument(element: React.ReactElement): Document {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(element),
    'text/html'
  );
}

describe('DesktopSurfaceImage', () => {
  it('scopes the desktop cover preload to the desktop breakpoint', () => {
    const document = renderDocument(
      <DesktopSurfaceImage src={HERO_URL} alt='' sizes={HERO_SIZES} />
    );

    const preloads = document.querySelectorAll(
      'link[rel="preload"][as="image"]'
    );
    expect(preloads).toHaveLength(1);
    const preload = preloads[0];
    expect(PROFILE_DESKTOP_SURFACE_MEDIA_QUERY).toBe('(min-width: 1180px)');
    expect(preload.getAttribute('media')).toBe(
      PROFILE_DESKTOP_SURFACE_MEDIA_QUERY
    );
    expect(preload.getAttribute('fetchpriority')).toBe('high');
  });

  it('keeps the image lazy so a hidden desktop surface fetches nothing on phones', () => {
    const document = renderDocument(
      <DesktopSurfaceImage src={HERO_URL} alt='' sizes={HERO_SIZES} />
    );

    const image = document.querySelector('img');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.hasAttribute('fetchpriority')).toBe(false);
  });

  it('preloads exactly the candidate set the image will request', () => {
    const document = renderDocument(
      <DesktopSurfaceImage src={HERO_URL} alt='' sizes={HERO_SIZES} />
    );

    const image = document.querySelector('img');
    const preload = document.querySelector('link[rel="preload"][as="image"]');
    expect(image?.getAttribute('srcset')).toBeTruthy();
    expect(preload?.getAttribute('imagesrcset')).toBe(
      image?.getAttribute('srcset')
    );
    expect(preload?.getAttribute('imagesizes')).toBe(HERO_SIZES);
    expect(image?.getAttribute('sizes')).toBe(HERO_SIZES);
  });

  it('emits no preload and renders the fallback when there is no source', () => {
    const document = renderDocument(
      <DesktopSurfaceImage
        src={null}
        alt='Cover'
        sizes='320px'
        fallbackVariant='release'
      />
    );

    expect(document.querySelector('link[rel="preload"]')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[role="img"]')).not.toBeNull();
  });

  it('has no axe violations for the cover, its failed-load placeholder and a missing source', async () => {
    const frame = (element: React.ReactElement) => (
      <div style={{ position: 'relative', height: 320, width: 480 }}>
        {element}
      </div>
    );

    const cover = render(
      frame(
        <DesktopSurfaceImage src={HERO_URL} alt='Cover' sizes={HERO_SIZES} />
      )
    );
    const image = cover.getByRole('img', { name: 'Cover' });
    expect(image).toHaveAttribute('loading', 'lazy');
    await expectNoA11yViolations(cover.container);

    // Offline or an expired CDN URL: the request fails and the placeholder
    // takes the image's place.
    fireEvent.error(image);
    expect(cover.container.querySelector('img')).toBeNull();
    expect(cover.getByRole('img', { name: 'Cover' })).toBeInTheDocument();
    await expectNoA11yViolations(cover.container);
    cover.unmount();

    const missing = render(
      frame(
        <DesktopSurfaceImage
          src={null}
          alt='Cover'
          sizes='320px'
          fallbackVariant='release'
        />
      )
    );
    await expectNoA11yViolations(missing.container);
  });
});
