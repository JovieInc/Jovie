type HelpScreenshotProps = {
  src: string;
  /** Describes what the screenshot proves about the adjacent step. */
  alt: string;
  caption?: string;
};

/**
 * Visual proof for the adjacent step. `alt` is required and the build fails
 * without it so uncertifiable screenshots cannot ship silently.
 */
export function HelpScreenshot({ src, alt, caption }: HelpScreenshotProps) {
  if (typeof alt !== 'string' || !alt.trim()) {
    throw new Error(
      'HelpScreenshot requires non-empty alt text describing the proof.'
    );
  }
  return (
    <figure className='help-screenshot' data-help-proof='screenshot'>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading='lazy' decoding='async' />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

type HelpVideoProps = {
  src: string;
  /** Accessible name for the clip. */
  alt: string;
  /** WebVTT captions track URL; required so clips are never shipped silent. */
  captions: string;
  poster?: string;
  caption?: string;
};

/**
 * Short focused clip shown at a meaningful transition. Never autoplays and
 * defers loading so reduced-motion and low-bandwidth readers are unaffected.
 */
export function HelpVideo({
  src,
  alt,
  captions,
  poster,
  caption,
}: HelpVideoProps) {
  if (typeof alt !== 'string' || !alt.trim()) {
    throw new Error(
      'HelpVideo requires non-empty alt text describing the clip.'
    );
  }
  return (
    <figure className='help-video' data-help-proof='video'>
      <video
        src={src}
        poster={poster}
        controls
        preload='none'
        playsInline
        aria-label={alt}
      >
        <track kind='captions' src={captions} label='Captions' />
      </video>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
