// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  generateQrCodeDataUrl,
  generateQrCodeSvg,
  qrCodeDataUrlToBlob,
} from './qr-code';

const URL_TO_ENCODE = 'https://jov.ie/tim';

describe('qr-code (encoder loaded on first use)', () => {
  it('renders a PNG data URL that converts to an image/png Blob', async () => {
    const dataUrl = await generateQrCodeDataUrl(URL_TO_ENCODE, 128);

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const blob = qrCodeDataUrlToBlob(dataUrl);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('renders SVG markup at the requested size', async () => {
    const svg = await generateQrCodeSvg(URL_TO_ENCODE, 256);

    expect(svg).toContain('<svg');
    expect(svg).toContain('width="256"');
  });

  it('rejects a string that is not a data URL', () => {
    expect(() => qrCodeDataUrlToBlob('not-a-data-url')).toThrow(
      'Invalid QR code data URL'
    );
  });
});
