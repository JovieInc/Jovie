// design-sync stub: replaces next/image with a plain <img> for browser bundles.
// next/image has a Node.js server runtime that cannot run in Claude Design's
// browser sandbox. This stub is API-compatible for the props that marketing
// components actually use (src, alt, width, height, className, fill, priority,
// sizes). It does NOT do any image optimisation — it renders the source URL as-is.
import * as React from 'react';

interface ImageProps {
  readonly src: string | { src: string };
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
  readonly fill?: boolean;
  readonly priority?: boolean;
  readonly sizes?: string;
  readonly style?: React.CSSProperties;
  readonly quality?: number;
  readonly loading?: 'lazy' | 'eager';
  readonly blurDataURL?: string;
  readonly placeholder?: 'blur' | 'empty';
  readonly onLoad?: React.ReactEventHandler<HTMLImageElement>;
  readonly onError?: React.ReactEventHandler<HTMLImageElement>;
  readonly [key: string]: unknown;
}

function Image({
  src,
  alt,
  width,
  height,
  className,
  fill,
  priority: _priority,
  sizes: _sizes,
  quality: _quality,
  blurDataURL: _blurDataURL,
  placeholder: _placeholder,
  style,
  ...rest
}: ImageProps) {
  const resolvedSrc = typeof src === 'object' && src !== null ? src.src : src;
  const resolvedStyle: React.CSSProperties = fill
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...style,
      }
    : (style ?? {});

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      style={resolvedStyle}
      {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
}

export default Image;
