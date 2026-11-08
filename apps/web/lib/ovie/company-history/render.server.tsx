import 'server-only';

import { ImageResponse } from 'next/og';
import { loadInterFonts } from '@/lib/share/image-utils';
import {
  SHIPPING_CHART_SIZE,
  ShippingChart,
  type ShippingChartInput,
} from './shipping-chart';

/** PNG response for one shipping window. Deterministic for a given input. */
export async function renderShippingChart(
  input: ShippingChartInput,
  headers: Record<string, string> = {}
): Promise<ImageResponse> {
  const fonts = await loadInterFonts();
  return new ImageResponse(<ShippingChart {...input} />, {
    ...SHIPPING_CHART_SIZE,
    headers,
    fonts: [
      { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fonts.semibold, weight: 600, style: 'normal' },
    ],
  });
}
