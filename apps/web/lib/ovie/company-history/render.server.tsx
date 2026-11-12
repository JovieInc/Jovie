import 'server-only';

import { readFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import { MetricChart, type MetricChartInput } from './metric-chart';
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

async function renderPng(
  element: ReactElement,
  headers: Record<string, string>
): Promise<ImageResponse> {
  const [regular, semibold] = await loadFonts().catch(error => {
    fonts = null;
    throw error;
  });
  return new ImageResponse(element, {
    ...SHIPPING_CHART_SIZE,
    headers,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
    ],
  });
}

/** PNG response for one shipping window. Deterministic for a given input. */
export function renderShippingChart(
  input: ShippingChartInput,
  headers: Record<string, string> = {}
): Promise<ImageResponse> {
  return renderPng(<ShippingChart {...input} />, headers);
}

/** PNG response for one daily metric window, in the shipping chart's layout. */
export function renderMetricChart(
  input: MetricChartInput,
  headers: Record<string, string> = {}
): Promise<ImageResponse> {
  return renderPng(<MetricChart {...input} />, headers);
}
