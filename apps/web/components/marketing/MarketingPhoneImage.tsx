import Image from 'next/image';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

const DEFAULT_MARKETING_QUALITY = 85;

interface MarketingPhoneImageProps {
  readonly scenarioId: string;
  readonly altOverride?: string;
  readonly sizes?: string;
  readonly priority?: boolean;
  readonly className?: string;
  readonly fill?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
}

export function MarketingPhoneImage({
  scenarioId,
  altOverride,
  sizes,
  priority,
  className,
  fill,
  width,
  height,
  quality,
}: MarketingPhoneImageProps) {
  const image = getMarketingExportImage(scenarioId);
  if (fill) {
    return (
      <Image
        src={image.publicUrl}
        alt={altOverride ?? image.alt}
        fill
        sizes={sizes}
        priority={priority}
        quality={quality ?? DEFAULT_MARKETING_QUALITY}
        className={className}
      />
    );
  }
  return (
    <Image
      src={image.publicUrl}
      alt={altOverride ?? image.alt}
      width={width ?? image.width}
      height={height ?? image.height}
      sizes={sizes}
      priority={priority}
      quality={quality ?? DEFAULT_MARKETING_QUALITY}
      className={className}
    />
  );
}
