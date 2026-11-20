// @vitest-environment jsdom
import { appendFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureKeyframe,
  HOME_PREVIEW_AUDIT_SOURCE,
  type HomePreviewAudit,
  type KeyframeRecord,
} from '../../e2e/helpers/golden-path-keyframes';

vi.mock('node:fs', () => ({ appendFileSync: vi.fn(), mkdirSync: vi.fn() }));

function audit(): HomePreviewAudit {
  return new Function(`return ${HOME_PREVIEW_AUDIT_SOURCE}`)();
}

function preview({ complete = true, width = 780, status = 'loaded' } = {}) {
  document.body.innerHTML = `<section data-hero-canvas><h1>Be found. Be understood.</h1><p class="homepage-hero-canvas__subhead">Published copy</p><div data-testid="homepage-hero-proof"><div data-testid="product-screenshot-frame-template-profile-live-mobile" data-status="${status}"><img src="/product-screenshots/template-profile-live-phone.png"></div></div></section>`;
  const image = document.querySelector('img')!;
  Object.defineProperties(image, {
    complete: { configurable: true, value: complete },
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: width ? 1264 : 0 },
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 796,
    y: 137,
    width: 319,
    height: 518,
    left: 796,
    top: 137,
    right: 1115,
    bottom: 655,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    'getComputedStyle',
    (el: Element) =>
      ({
        display: el.getAttribute('data-display') ?? 'block',
        visibility: 'visible',
        opacity: el.getAttribute('data-opacity') ?? '1',
        contentVisibility: 'visible',
        transform: 'none',
      }) as CSSStyleDeclaration
  );
  return image;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('serialized public Home preview audit', () => {
  it('binds loaded pixels, selected copy and painted geometry', () => {
    preview();
    expect(audit()).toMatchObject({
      status: 'ready',
      scenario: 'template-profile-live-mobile',
      selectedCopy: {
        headline: 'Be found. Be understood.',
        subhead: 'Published copy',
      },
      image: {
        resource: 'expected',
        complete: true,
        naturalWidth: 780,
        naturalHeight: 1264,
      },
      geometry: {
        ancestors: expect.arrayContaining([
          expect.objectContaining({
            box: { x: 796, y: 137, width: 319, height: 518 },
          }),
        ]),
      },
    });
  });

  it('distinguishes a pending image from a loaded empty or errored preview', () => {
    const image = preview({ complete: false, width: 0, status: 'loading' });
    expect(audit()).toMatchObject({
      status: 'loading',
      image: { complete: false, naturalWidth: 0 },
    });
    Object.defineProperty(image, 'complete', {
      configurable: true,
      value: true,
    });
    expect(audit().status).toBe('error');
    image.remove();
    document
      .querySelector('[data-status]')!
      .setAttribute('data-status', 'error');
    expect(audit().status).toBe('error');
  });

  it('records a hidden ancestor even when the image has decoded pixels', () => {
    preview();
    document
      .querySelector('[data-testid="homepage-hero-proof"]')!
      .setAttribute('data-opacity', '0');
    expect(audit().status).toBe('hidden');
    expect(audit().geometry.ancestors.some(el => el.opacity === '0')).toBe(
      true
    );
  });

  it('records missing proof and never serializes unexpected URL credentials or query', () => {
    expect(audit().status).toBe('missing');
    const image = preview();
    const resource = new URL('https://external.test/image/SECRET');
    resource.username = 'USER_SECRET';
    resource.password = 'PASS_SECRET';
    resource.searchParams.set('token', 'QUERY_SECRET');
    resource.hash = 'FRAGMENT_SECRET';
    image.src = resource.href;
    const result = audit();
    expect(result.image.resource).toBe('unexpected');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('recognizes the public preview path without recording a cache query or fragment', () => {
    const image = preview();
    image.src =
      '/product-screenshots/template-profile-live-phone.png?v=QUERY_SECRET#FRAGMENT_SECRET';
    expect(audit().image.resource).toBe('expected');
    expect(JSON.stringify(audit())).not.toContain('SECRET');
  });

  it('binds image readiness before and after screenshot bytes without changing the journey outcome', async () => {
    const image = preview();
    vi.stubEnv('GOLDEN_PATH_KEYFRAME_DIR', '/public-home-proof-fixture');
    const page = {
      on: vi.fn(),
      url: () => 'http://localhost:3250/',
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      evaluate: async (source: string) => new Function(`return ${source}`)(),
      screenshot: vi.fn(async () => {
        Object.defineProperty(image, 'complete', {
          configurable: true,
          value: false,
        });
        document
          .querySelector('[data-status]')!
          .setAttribute('data-status', 'loading');
        return Buffer.from('public home screenshot');
      }),
    } as unknown as Page;

    await expect(captureKeyframe(page, 'home')).resolves.toBeUndefined();
    const calls = vi.mocked(appendFileSync).mock.calls;
    const record = JSON.parse(String(calls.at(-1)![1])) as KeyframeRecord;
    expect(record.homePreview?.before.status).toBe('ready');
    expect(record.homePreview?.after.status).toBe('loading');
    expect(record.homePreview?.before.geometry.ancestors[0]?.box).toEqual({
      x: 796,
      y: 137,
      width: 319,
      height: 518,
    });
    expect(record.audit.brokenImages).toEqual([]);
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
