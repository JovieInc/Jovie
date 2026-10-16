// @coverage-via apps/web/tests/unit/marketing/media-request.test.tsx
import {
  type MarketingMediaRecipeInput,
  resolveMarketingMediaRequest,
} from '@/data/marketing/mediaRecipes';
import { CompactGlassCaptureDemo } from './artist-profile/CompactGlassCaptureDemo';
import { MarketingEditorialBackground } from './MarketingEditorialBackground';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

/** Static dispatch only. Generator input cannot import or execute a module. */
export function MarketingMedia({
  request,
}: {
  readonly request: MarketingMediaRecipeInput;
}) {
  const result = resolveMarketingMediaRequest(request);
  if (!result.ok)
    throw new Error(
      result.findings
        .map(finding => `${finding.subject}: ${finding.message}`)
        .join('\n')
    );
  const { treatment } = result.presentation;
  if (treatment === 'flow' || treatment === 'soft')
    return <MarketingEditorialBackground variant={treatment} />;
  if (request.source.kind === 'real-capture')
    return (
      <ProductScreenshotFrame
        scenarioId={request.source.scenarioId}
        variant='dark-glass'
        focus={null}
        sizes='100vw'
      />
    );
  return <CompactGlassCaptureDemo initialPhase='done' autoPlay={false} />;
}
