import 'server-only';

import { readFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import {
  SHIPPING_CHART_SIZE,
  ShippingChart,
  type ShippingChartInput,
} from './shipping-chart';

/*
 * Inter as static TTF instances of Inter-Variable (Satori cannot read woff2).
 * `new URL(..., import.meta.url)` lets the bundler trace and ship the files
 * with this route, so no outputFileTracingIncludes entry is needed.
 */
const INTER_REGULAR = new URL(
  '../../../public/fonts/Inter-Regular.ttf',
  import.meta.url
);
const INTER_SEMIBOLD = new URL(
  '../../../public/fonts/Inter-SemiBold.ttf',
  import.meta.url
);

let fonts: Promise<[Buffer, Buffer]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all([readFile(INTER_REGULAR), readFile(INTER_SEMIBOLD)]));

/** PNG response for one shipping window. Deterministic for a given input. */
export async function renderShippingChart(
  input: ShippingChartInput,
  headers: Record<string, string> = {}
): Promise<ImageResponse> {
  const [regular, semibold] = await loadFonts().catch(error => {
    fonts = null;
    throw error;
  });
  return new ImageResponse(<ShippingChart {...input} />, {
    ...SHIPPING_CHART_SIZE,
    headers,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
    ],
  });
}
