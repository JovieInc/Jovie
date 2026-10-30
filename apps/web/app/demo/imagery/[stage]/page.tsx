import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImageryStage } from '@/components/marketing/ImageryStage';
import { IMAGERY_STAGES, type ImageryStageId } from '@/lib/imagery/stages';

/**
 * Cold render target for `imagery:verify` (docs/marketing/IMAGERY.md): one
 * stage on a bare dark page, no surrounding context, so a judge sees exactly
 * what a visitor sees of the stage.
 */
interface DemoImageryPageProps {
  readonly params: Promise<{ stage: string }>;
}

export const metadata: Metadata = { title: 'Jovie Imagery Stage' };
export const revalidate = false;

export function generateStaticParams() {
  return IMAGERY_STAGES.map(stage => ({ stage: stage.id }));
}

export default async function DemoImageryPage({
  params,
}: Readonly<DemoImageryPageProps>) {
  const { stage } = await params;
  const known = IMAGERY_STAGES.find(candidate => candidate.id === stage);
  if (!known) notFound();
  return (
    <main className='mx-auto w-full max-w-[1440px] bg-base p-4'>
      <ImageryStage id={known.id as ImageryStageId} priority />
    </main>
  );
}
