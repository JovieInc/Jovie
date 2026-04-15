import { notFound } from 'next/navigation';
import {
  isMarketingRenderRouteSurfaceId,
  MarketingRenderSurface,
} from '@/features/home/MarketingRenderSurface';

function getSearchParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MarketingSurfaceRenderPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ surface: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { surface } = await params;
  const resolvedSearchParams = await searchParams;
  const hideChrome = getSearchParam(resolvedSearchParams.chrome) !== 'true';
  const width = Number.parseInt(
    getSearchParam(resolvedSearchParams.width) ?? '430',
    10
  );

  if (!isMarketingRenderRouteSurfaceId(surface)) {
    notFound();
  }

  return (
    <div
      className='flex min-h-screen items-center justify-center bg-black'
      style={{ padding: '2rem' }}
    >
      <div
        style={{
          width: `${Number.isFinite(width) ? width : 430}px`,
          maxWidth: '100%',
        }}
        data-testid='marketing-surface-render'
        data-hide-chrome={hideChrome}
      >
        <MarketingRenderSurface surfaceId={surface} hideChrome={hideChrome} />
      </div>
    </div>
  );
}
