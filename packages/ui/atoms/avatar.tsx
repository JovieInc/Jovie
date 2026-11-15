'use client';

import { cn } from '@jovie/ui/lib/utils';
import * as React from 'react';

import {
  AVATAR_OUTLINE_CLASSNAME,
  AVATAR_RING_CLASSNAME,
  AVATAR_SIZE_MAP,
  type AvatarShape,
  type AvatarSize,
  getAvatarShapeClassName,
  getAvatarSizePx,
} from './avatar-contract';

export type { AvatarShape, AvatarSize } from './avatar-contract';
export {
  AVATAR_OUTLINE_CLASSNAME,
  AVATAR_PERSON_RADIUS_CLASSNAME,
  AVATAR_RING_CLASSNAME,
  AVATAR_SHAPE_NAMES,
  AVATAR_SIZE_MAP,
  AVATAR_SIZE_NAMES,
  getAvatarArtworkRadiusClassName,
  getAvatarShapeClassName,
  getAvatarSizePx,
} from './avatar-contract';

export type AvatarStatus = 'online' | 'away' | 'offline';

/** Load state of a composed AvatarImage; `idle` means no image is mounted. */
type AvatarImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface AvatarContextValue {
  readonly size: AvatarSize;
  readonly shape: AvatarShape;
  readonly imageStatus: AvatarImageStatus;
  readonly setImageStatus: (status: AvatarImageStatus) => void;
  readonly hasFallback: boolean;
  readonly setHasFallback: (present: boolean) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

// ---------------------------------------------------------------------------
// Primitive building blocks — exported for composability
// ---------------------------------------------------------------------------

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly size?: AvatarSize;
  readonly ring?: boolean;
  /** Person/user avatars are circular; release artwork is rounded-square. */
  readonly shape?: AvatarShape;
}

/** Root container. Shape class is last so local className cannot change crop. */
const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  (
    {
      size = 'md',
      ring = false,
      shape = 'person',
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const px = getAvatarSizePx(size);
    const isPerson = shape === 'person';
    const [imageStatus, setImageStatus] =
      React.useState<AvatarImageStatus>('idle');
    const [hasFallback, setHasFallback] = React.useState(false);
    const contextValue = React.useMemo(
      () => ({
        size,
        shape,
        imageStatus,
        setImageStatus,
        hasFallback,
        setHasFallback,
      }),
      [size, shape, imageStatus, hasFallback]
    );
    return (
      <span
        ref={ref}
        data-ring={ring ? 'true' : 'false'}
        data-size={size}
        data-shape={shape}
        className={cn(
          'relative isolate inline-flex shrink-0 items-center justify-center align-middle',
          isPerson ? 'overflow-visible' : 'overflow-hidden',
          AVATAR_OUTLINE_CLASSNAME,
          ring && AVATAR_RING_CLASSNAME,
          className,
          getAvatarShapeClassName(shape, px)
        )}
        style={{ width: px, height: px, ...style }}
        {...props}
      >
        <AvatarContext.Provider value={contextValue}>
          {children}
        </AvatarContext.Provider>
      </span>
    );
  }
);
Avatar.displayName = 'Avatar';

// ---------------------------------------------------------------------------

export interface AvatarImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}

/**
 * `AvatarImage` — rendered inside `Avatar`.
 * Composed with `AvatarFallback`, it stays out of view until it loads and is
 * hidden on error, so the fallback shows instead of a broken image (Radix
 * Avatar behaviour). On its own it renders as a plain image.
 */
const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, alt = '', size, shape, src, ...props }, ref) => {
    const context = React.useContext(AvatarContext);
    const resolvedSize = context?.size ?? size ?? 'md';
    const resolvedShape = context?.shape ?? shape ?? 'person';
    const px = getAvatarSizePx(resolvedSize);
    const setImageStatus = context?.setImageStatus;
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLImageElement | null) => {
        imgRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    React.useLayoutEffect(() => {
      if (!setImageStatus) return undefined;
      const img = imgRef.current;
      if (!src || !img) {
        setImageStatus('error');
        return () => setImageStatus('idle');
      }
      // Native listeners keep the caller's onLoad/onError props untouched.
      const handleLoad = () => setImageStatus('loaded');
      const handleError = () => setImageStatus('error');
      img.addEventListener('load', handleLoad);
      img.addEventListener('error', handleError);
      if (img.complete) {
        // Cached or already-decoded images fire no load event after mount.
        setImageStatus(img.naturalWidth > 0 ? 'loaded' : 'error');
      } else {
        setImageStatus('loading');
      }
      return () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
        setImageStatus('idle');
      };
    }, [src, setImageStatus]);

    const status = context?.imageStatus ?? 'idle';
    const composed = Boolean(context?.hasFallback);

    return (
      <img
        ref={setRefs}
        alt={alt}
        src={src}
        // Intrinsic dimensions reserve the frame before the image decodes;
        // the h-full/w-full classes still size it to the Avatar root.
        width={px}
        height={px}
        hidden={composed && status === 'error' ? true : undefined}
        className={cn(
          'h-full w-full',
          // Keep loading off-screen behind the fallback until it is ready.
          composed && status !== 'loaded' && 'absolute inset-0 opacity-0',
          className,
          resolvedShape === 'artwork' ? 'object-contain' : 'object-cover',
          getAvatarShapeClassName(resolvedShape, px)
        )}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = 'AvatarImage';

// ---------------------------------------------------------------------------

export interface AvatarFallbackProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}

/**
 * `AvatarFallback` — shown when no image is provided, while a composed
 * `AvatarImage` loads, and after it fails. Styled as initials.
 */
const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ size, shape, className, ...props }, ref) => {
    const context = React.useContext(AvatarContext);
    const resolvedSize = context?.size ?? size ?? 'md';
    const resolvedShape = context?.shape ?? shape ?? 'person';
    const setHasFallback = context?.setHasFallback;

    React.useLayoutEffect(() => {
      if (!setHasFallback) return undefined;
      setHasFallback(true);
      return () => setHasFallback(false);
    }, [setHasFallback]);

    if (context?.imageStatus === 'loaded') return null;

    return (
      <span
        ref={ref}
        className={cn(
          'flex h-full w-full items-center justify-center font-medium select-none',
          'overflow-hidden bg-surface-2 text-secondary-token',
          AVATAR_SIZE_MAP[resolvedSize].text,
          className,
          getAvatarShapeClassName(resolvedShape, getAvatarSizePx(resolvedSize))
        )}
        {...props}
      />
    );
  }
);
AvatarFallback.displayName = 'AvatarFallback';

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-tertiary-token',
};

export interface AvatarStatusDotProps {
  readonly status: AvatarStatus;
  readonly size?: AvatarSize;
  readonly className?: string;
}

function AvatarStatusDot({ status, size, className }: AvatarStatusDotProps) {
  const context = React.useContext(AvatarContext);
  const resolvedSize = context?.size ?? size ?? 'md';
  const { dot, dotOffset } = AVATAR_SIZE_MAP[resolvedSize];
  return (
    <span
      role='img'
      aria-label={`${status} status`}
      data-size={resolvedSize}
      data-status={status}
      className={cn(
        'absolute rounded-full',
        AVATAR_RING_CLASSNAME,
        dot,
        dotOffset,
        STATUS_COLOR[status],
        className
      )}
    >
      <span className='sr-only'>{status}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Higher-level UserAvatar
// ---------------------------------------------------------------------------

function firstGrapheme(word: string): string {
  const Segmenter = (
    globalThis as { Intl?: { Segmenter?: typeof Intl.Segmenter } }
  ).Intl?.Segmenter;
  if (!Segmenter) return Array.from(word)[0] ?? '';
  const first = new Segmenter(undefined, { granularity: 'grapheme' })
    .segment(word)
    [Symbol.iterator]()
    .next();
  return first.done ? '' : first.value.segment;
}

/**
 * Derive up-to-2-char initials from a full name string. Grapheme-safe, so
 * emoji-prefixed, CJK, and combining-mark names never split a character.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return firstGrapheme(parts[0]).toUpperCase();
  return (
    firstGrapheme(parts[0]) + firstGrapheme(parts.at(-1) ?? '')
  ).toUpperCase();
}

export interface UserAvatarProps {
  /** Image URL — if omitted or fails, initials are shown. */
  readonly src?: string;
  /** Full name used for initials and alt text. */
  readonly name?: string;
  readonly size?: AvatarSize;
  readonly status?: AvatarStatus;
  /** Show ring separator (useful for stacked groups). */
  readonly ring?: boolean;
  readonly className?: string;
}

function UserAvatar({
  src,
  name = '',
  size = 'md',
  status,
  ring = false,
  className,
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const initials = name ? getInitials(name) : '?';
  const altText = name || 'Avatar';

  return (
    <Avatar size={size} ring={ring} shape='person' className={className}>
      {src && src !== failedSrc ? (
        <AvatarImage
          src={src}
          alt={altText}
          onError={() => setFailedSrc(src)}
          onLoad={() => setFailedSrc(null)}
        />
      ) : (
        <AvatarFallback role='img' aria-label={altText}>
          {initials}
        </AvatarFallback>
      )}
      {status && <AvatarStatusDot status={status} />}
    </Avatar>
  );
}

// ---------------------------------------------------------------------------

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  getInitials,
  UserAvatar,
};
