import QRCode from 'qrcode';

/**
 * Default QR code size for high-resolution printing (1024px).
 */
const DEFAULT_QR_SIZE = 1024;

/**
 * Shared QR code rendering options.
 * Dark foreground on white background for maximum scannability.
 */
const BASE_OPTIONS = {
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
} as const;

/**
 * Generate a QR code as a PNG data URL.
 *
 * @param url - The URL to encode in the QR code
 * @param size - Output image width/height in pixels (default 1024)
 * @returns A `data:image/png;base64,...` string
 */
export async function generateQrCodeDataUrl(
  url: string,
  size: number = DEFAULT_QR_SIZE
): Promise<string> {
  return QRCode.toDataURL(url, {
    ...BASE_OPTIONS,
    width: size,
    type: 'image/png',
  });
}

/**
 * Generate a QR code as an SVG string.
 *
 * @param url - The URL to encode in the QR code
 * @param size - Desired width/height attribute on the root `<svg>` (default 1024)
 * @returns A complete SVG markup string
 */
export async function generateQrCodeSvg(
  url: string,
  size: number = DEFAULT_QR_SIZE
): Promise<string> {
  return QRCode.toString(url, {
    ...BASE_OPTIONS,
    width: size,
    type: 'svg',
  });
}

export function qrCodeDataUrlToBlob(dataUrl: string): Blob {
  const [metadata, base64Data] = dataUrl.split(',');
  if (!metadata?.startsWith('data:') || !base64Data) {
    throw new Error('Invalid QR code data URL');
  }

  const mimeType = /^data:([^;]+)/.exec(metadata)?.[1] ?? 'image/png';
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }

  return new Blob([bytes], { type: mimeType });
}
