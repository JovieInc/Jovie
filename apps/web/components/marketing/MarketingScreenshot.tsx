import { ProductScreenshot } from '@/features/home/ProductScreenshot';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

const DEFAULT_MARKETING_QUALITY = 85;
const DEFAULT_MARKETING_SIZES =
  '(min-width: 1024px) 1200px, (min-width: 640px) 90vw, 100vw';

interface MarketingScreenshotProps {
  readonly scenarioId: string;
  readonly altOverride?: string;
  readonly title?: string;
  readonly chrome?: 'window' | 'minimal';
  readonly priority?: boolean;
  readonly className?: string;
  readonly testId?: string;
  readonly sizes?: string;
  readonly quality?: number;
  readonly width?: number;
  readonly height?: number;
}

export function MarketingScreenshot({
  scenarioId,
  altOverride,
  title,
  chrome = 'minimal',
  priority,
  className,
  testId,
  sizes,
  quality,
  width,
  height,
}: MarketingScreenshotProps) {
  const image = getMarketingExportImage(scenarioId);
  return (
    <ProductScreenshot
      src={image.publicUrl}
      alt={altOverride ?? image.alt}
      width={width ?? image.width}
      height={height ?? image.height}
      title={title}
      chrome={chrome}
      priority={priority}
      className={className}
      testId={testId ?? `marketing-screenshot-${scenarioId}`}
      sizes={sizes ?? DEFAULT_MARKETING_SIZES}
      quality={quality ?? DEFAULT_MARKETING_QUALITY}
      skipCheck
    />
  );
}
