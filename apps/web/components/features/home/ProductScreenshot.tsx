import { ProductScreenshotClient } from './ProductScreenshotClient';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

interface ProductScreenshotProps {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly title?: string;
  readonly priority?: boolean;
  readonly className?: string;
  readonly skipCheck?: boolean;
  readonly testId?: string;
  readonly chrome?: 'window' | 'minimal';
  readonly sizes?: string;
  readonly quality?: number;
}

export function ProductScreenshot({
  src,
  alt,
  width,
  height,
  title = 'Jovie',
  priority = false,
  className,
  skipCheck = false,
  testId,
  chrome = 'window',
  sizes,
  quality,
}: ProductScreenshotProps) {
  const aspectRatio = `${width} / ${height}`;

  if (skipCheck) {
    return (
      <ProductScreenshotFrame
        alt={alt}
        aspectRatio={aspectRatio}
        chrome={chrome}
        className={className}
        height={height}
        isAvailable={true}
        priority={priority}
        quality={quality}
        sizes={sizes}
        src={src}
        testId={testId}
        title={title}
        width={width}
      />
    );
  }

  return (
    <ProductScreenshotClient
      alt={alt}
      aspectRatio={aspectRatio}
      chrome={chrome}
      className={className}
      height={height}
      priority={priority}
      quality={quality}
      sizes={sizes}
      src={src}
      testId={testId}
      title={title}
      width={width}
    />
  );
}
