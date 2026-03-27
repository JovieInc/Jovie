import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  DemoShowcaseSurface,
  type DemoShowcaseSurfaceId,
} from '@/features/demo/DemoShowcaseSurface';

const VALID_SURFACES: readonly DemoShowcaseSurfaceId[] = [
  'analytics',
  'earnings',
  'links',
  'settings',
  'onboarding-handle',
  'onboarding-dsp',
  'onboarding-profile-review',
] as const;

interface DemoShowcasePageProps {
  readonly params: Promise<{ surface: string }>;
}

export const metadata: Metadata = {
  title: 'Jovie Demo Showcase',
};

export const revalidate = false;

export default async function DemoShowcasePage({
  params,
}: Readonly<DemoShowcasePageProps>) {
  const { surface } = await params;
  if (!VALID_SURFACES.includes(surface as DemoShowcaseSurfaceId)) {
    notFound();
  }

  return <DemoShowcaseSurface surface={surface as DemoShowcaseSurfaceId} />;
}
