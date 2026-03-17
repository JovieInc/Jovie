import { cn } from '@jovie/ui/lib/utils';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const SIZE_MAP = {
  xs: {
    px: 16,
    text: 'text-[8px]',
    dot: 'h-2 w-2',
    dotOffset: '-bottom-px -right-px',
  },
  sm: {
    px: 20,
    text: 'text-[10px]',
    dot: 'h-2.5 w-2.5',
    dotOffset: '-bottom-px -right-px',
  },
  md: {
    px: 24,
    text: 'text-[11px]',
    dot: 'h-3 w-3',
    dotOffset: '-bottom-0.5 -right-0.5',
  },
  lg: {
    px: 32,
    text: 'text-[13px]',
    dot: 'h-3.5 w-3.5',
    dotOffset: '-bottom-0.5 -right-0.5',
  },
  xl: {
    px: 40,
    text: 'text-[15px]',
    dot: 'h-4 w-4',
    dotOffset: '-bottom-0.5 -right-0.5',
  },
  '2xl': {
    px: 96,
    text: 'text-2xl',
    dot: 'h-5 w-5',
    dotOffset: '-bottom-1 -right-1',
  },
  'display-sm': {
    px: 112,
    text: 'text-xl',
    dot: 'h-5 w-5',
    dotOffset: '-bottom-1 -right-1',
  },
  'display-md': {
    px: 128,
    text: 'text-2xl',
    dot: 'h-6 w-6',
    dotOffset: '-bottom-1 -right-1',
  },
  'display-lg': {
    px: 160,
    text: 'text-3xl',
    dot: 'h-6 w-6',
    dotOffset: '-bottom-1.5 -right-1.5',
  },
  'display-xl': {
    px: 192,
    text: 'text-3xl',
    dot: 'h-7 w-7',
    dotOffset: '-bottom-1.5 -right-1.5',
  },
  'display-2xl': {
    px: 224,
    text: 'text-4xl',
    dot: 'h-7 w-7',
    dotOffset: '-bottom-2 -right-2',
  },
  'display-3xl': {
    px: 256,
    text: 'text-4xl',
    dot: 'h-8 w-8',
    dotOffset: '-bottom-2 -right-2',
  },
  'display-4xl': {
    px: 384,
    text: 'text-5xl',
    dot: 'h-8 w-8',
    dotOffset: '-bottom-2 -right-2',
  },
} as const;

export type AvatarSize = keyof typeof SIZE_MAP;
export type AvatarStatus = 'online' | 'away' | 'offline';

// ---------------------------------------------------------------------------
// Primitive building blocks — exported for composability
// ---------------------------------------------------------------------------

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly size?: AvatarSize;
  readonly ring?: boolean;
}

/**
 * `Avatar` — root container. Always a circle.
 */
const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ size = 'md', ring = false, className, style, ...props }, ref) => {
    const { px } = SIZE_MAP[size];
    return (
      <span
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          ring && 'ring-2 ring-(--linear-bg-page)',
          className
        )}
        style={{ width: px, height: px, ...style }}
        {...props}
      />
    );
  }
);
Avatar.displayName = 'Avatar';

// ---------------------------------------------------------------------------

export interface AvatarImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {}

/**
 * `AvatarImage` — rendered inside `Avatar`.
 * Hides itself via CSS if the image fails to load (browser default for broken imgs).
 */
const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, alt = '', ...props }, ref) => (
    <img
      ref={ref}
      alt={alt}
      className={cn('h-full w-full object-cover', className)}
      {...props}
    />
  )
);
AvatarImage.displayName = 'AvatarImage';

// ---------------------------------------------------------------------------

export interface AvatarFallbackProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  readonly size?: AvatarSize;
}

/**
 * `AvatarFallback` — shown when no image is provided. Styled as initials.
 */
const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ size = 'md', className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full font-[510] select-none',
        'bg-(--linear-bg-surface-2) text-(--linear-text-secondary)',
        SIZE_MAP[size].text,
        className
      )}
      {...props}
    />
  )
);
AvatarFallback.displayName = 'AvatarFallback';

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-(--linear-success)',
  away: 'bg-(--linear-warning)',
  offline: 'bg-(--linear-text-tertiary)',
};

export interface AvatarStatusDotProps {
  readonly status: AvatarStatus;
  readonly size?: AvatarSize;
  readonly className?: string;
}

function AvatarStatusDot({
  status,
  size = 'md',
  className,
}: AvatarStatusDotProps) {
  const { dot, dotOffset } = SIZE_MAP[size];
  return (
    <span
      className={cn(
        'absolute rounded-full ring-[1.5px] ring-(--linear-bg-page)',
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

/** Derive up-to-2-char initials from a full name string. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + (parts.at(-1) || '').charAt(0)).toUpperCase();
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
  const initials = name ? getInitials(name) : '?';
  const altText = name || 'Avatar';

  return (
    <Avatar size={size} ring={ring} className={className}>
      {src ? (
        <AvatarImage src={src} alt={altText} />
      ) : (
        <AvatarFallback size={size}>{initials}</AvatarFallback>
      )}
      {status && <AvatarStatusDot status={status} size={size} />}
    </Avatar>
  );
}

// ---------------------------------------------------------------------------

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  UserAvatar,
  getInitials,
};
