import { describe, expect, it } from 'vitest';
import {
  classifySameOriginRequestFailure,
  formatRequestFailure,
  isAbortedNextRscPrefetch,
  isDiagnosticAbortedImageRequest,
} from '../../visual-qa/aborted-image-request';

const ORIGIN = 'http://localhost:3000';

describe('isDiagnosticAbortedImageRequest', () => {
  it('treats an image abort as diagnostic, not a load failure', () => {
    expect(
      isDiagnosticAbortedImageRequest({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'image',
      })
    ).toBe(true);
  });

  it('keeps non-abort image failures on the request-failure gate', () => {
    for (const errorText of [
      'net::ERR_CONNECTION_REFUSED',
      'net::ERR_CONNECTION_RESET',
      'net::ERR_NAME_NOT_RESOLVED',
      'net::ERR_FAILED',
      undefined,
    ]) {
      expect(
        isDiagnosticAbortedImageRequest({
          errorText,
          resourceType: 'image',
        })
      ).toBe(false);
    }
  });

  it('keeps aborted non-image requests on the request-failure gate', () => {
    for (const resourceType of [
      'document',
      'script',
      'stylesheet',
      'fetch',
      'xhr',
    ]) {
      expect(
        isDiagnosticAbortedImageRequest({
          errorText: 'net::ERR_ABORTED',
          resourceType,
        })
      ).toBe(false);
    }
  });
});

describe('classifySameOriginRequestFailure', () => {
  it('moves the superseded next/image candidate out of the failure gate', () => {
    const url = `${ORIGIN}/_next/image?url=%2Fhero.webp&w=64&q=75`;
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'image',
        sameOrigin: true,
      })
    ).toBe('aborted-image');
    expect(formatRequestFailure(url, 'net::ERR_ABORTED')).toBe(
      `${url} net::ERR_ABORTED`
    );
  });

  it('keeps image connection failures, aborted documents, and unknown failures', () => {
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_CONNECTION_REFUSED',
        resourceType: 'image',
        sameOrigin: true,
      })
    ).toBe('failed-request');
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'document',
        sameOrigin: true,
      })
    ).toBe('failed-request');
    expect(
      formatRequestFailure(`${ORIGIN}/_next/image?url=%2Fhero.webp`, undefined)
    ).toBe(`${ORIGIN}/_next/image?url=%2Fhero.webp unknown failure`);
  });

  it('ignores cross-origin aborts', () => {
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'image',
        sameOrigin: false,
      })
    ).toBe('ignored');
  });

  it('ignores same-origin Next.js RSC prefetch aborts', () => {
    expect(
      isAbortedNextRscPrefetch({
        errorText: 'net::ERR_ABORTED',
        url: `${ORIGIN}/product?_rsc=5CB68i4pnAekjehf`,
      })
    ).toBe(true);
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'fetch',
        sameOrigin: true,
        url: `${ORIGIN}/pricing?_rsc=RUAe2X0j7vp0IAZ6`,
      })
    ).toBe('ignored');
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        headers: { RSC: '1' },
        resourceType: 'fetch',
        sameOrigin: true,
        url: `${ORIGIN}/pricing`,
      })
    ).toBe('ignored');
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        headers: { accept: 'text/x-component, */*' },
        resourceType: 'xhr',
        sameOrigin: true,
        url: `${ORIGIN}/product`,
      })
    ).toBe('ignored');
  });

  it('keeps non-RSC aborts and non-abort RSC failures', () => {
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'stylesheet',
        sameOrigin: true,
        url: `${ORIGIN}/_next/static/chunks/app.css`,
      })
    ).toBe('failed-request');
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        headers: { 'next-router-prefetch': '1' },
        resourceType: 'document',
        sameOrigin: true,
        url: `${ORIGIN}/product`,
      })
    ).toBe('failed-request');
    expect(
      classifySameOriginRequestFailure({
        errorText: 'net::ERR_ABORTED',
        resourceType: 'fetch',
        sameOrigin: true,
        url: `${ORIGIN}/product/_rsc`,
      })
    ).toBe('failed-request');
    for (const errorText of [
      'net::ERR_CONNECTION_REFUSED',
      'net::ERR_FAILED',
      undefined,
    ]) {
      expect(
        classifySameOriginRequestFailure({
          errorText,
          headers: { rsc: '1', accept: 'text/x-component' },
          resourceType: 'fetch',
          sameOrigin: true,
          url: `${ORIGIN}/product?_rsc=5CB68i4pnAekjehf`,
        })
      ).toBe('failed-request');
    }
  });
});
