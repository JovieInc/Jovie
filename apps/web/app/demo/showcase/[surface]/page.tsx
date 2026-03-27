import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  DEMO_SHOWCASE_SURFACE_IDS,
  type DemoShowcaseSurfaceId,
} from '@/components/features/demo/showcase-surfaces';
import { DemoPublicProfileSurfaceClient } from './DemoPublicProfileSurfaceClient';
import { DemoShowcaseSurfaceClient } from './DemoShowcaseSurfaceClient';

interface DemoShowcasePageProps {
  readonly params: Promise<{ surface: string }>;
}

function isDemoShowcaseSurfaceId(
  value: string
): value is DemoShowcaseSurfaceId {
  return (DEMO_SHOWCASE_SURFACE_IDS as readonly string[]).includes(value);
}

export const metadata: Metadata = {
  title: 'Jovie Demo Showcase',
};

export const revalidate = false;

export default async function DemoShowcasePage({
  params,
}: Readonly<DemoShowcasePageProps>) {
  const { surface } = await params;
  if (!isDemoShowcaseSurfaceId(surface)) {
    notFound();
  }

  if (surface === 'public-profile') {
    return <DemoPublicProfileSurfaceClient />;
  }

  return <DemoShowcaseSurfaceClient surface={surface} />;
}
