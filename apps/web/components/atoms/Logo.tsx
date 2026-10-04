import { BrandLogo, type BrandLogoTone } from '@/components/atoms/BrandLogo';
import { wordmarkGeometry } from '@/lib/brand/primitives';
import { cn } from '@/lib/utils';

export type LogoVariant = 'word' | 'wordAlt' | 'icon' | 'full' | 'fullAlt';

interface LogoProps
  extends Readonly<{
    readonly className?: string;
    readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly variant?: LogoVariant;
    readonly tone?: BrandLogoTone;
    /** @deprecated The wordmark is inline SVG now; nothing to prioritise. */
    readonly priority?: boolean;
    readonly 'aria-hidden'?: boolean;
    readonly 'data-testid'?: string;
  }> {}

// The wordmark is one ink per surface; 'color' no longer tints it.
const TONE_TEXT: Record<BrandLogoTone, string | undefined> = {
  auto: undefined,
  white: 'text-white',
  color: undefined,
  muted: 'text-muted-foreground/50',
};

export function Logo({
  className,
  size = 'md',
  variant = 'word',
  tone = 'auto',
  'aria-hidden': ariaHidden,
  'data-testid': dataTestId,
}: LogoProps) {
  const sizeClasses = {
    xs: 'h-4 w-auto',
    sm: 'h-6 w-auto',
    md: 'h-8 w-auto',
    lg: 'h-12 w-auto',
    xl: 'h-16 w-auto',
  };

  const iconSizePx: Record<
    NonNullable<LogoProps['size']>,
    16 | 20 | 24 | 32
  > = {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 32,
  };

  const wordmarkHeightPx: Record<NonNullable<LogoProps['size']>, number> = {
    xs: 16,
    sm: 24,
    md: 32,
    lg: 48,
    xl: 64,
  };

  // One wordmark (JOV-7760): 'word' and 'wordAlt' both draw the construction
  // outlines, whose o is the mark. Tone is applied as text colour.
  const wordmark = (wordmarkClassName?: string, testId?: string) => {
    const g = wordmarkGeometry(wordmarkHeightPx[size]);
    return (
      <svg
        xmlns='http://www.w3.org/2000/svg'
        viewBox={g.viewBox}
        role={ariaHidden ? undefined : 'img'}
        aria-hidden={ariaHidden}
        aria-label={ariaHidden ? undefined : 'Jovie logo'}
        data-testid={testId}
        data-wordmark-master={g.master}
        className={cn(
          sizeClasses[size],
          'transition-colors duration-subtle',
          TONE_TEXT[tone],
          wordmarkClassName
        )}
        style={
          TONE_TEXT[tone]
            ? undefined
            : { color: 'var(--linear-text-primary, currentColor)' }
        }
        fill='currentColor'
      >
        {g.glyphs.map(glyph => (
          <path key={glyph.char} d={glyph.d} />
        ))}
      </svg>
    );
  };

  if (variant === 'icon') {
    return (
      <BrandLogo
        size={iconSizePx[size]}
        tone={tone}
        alt={ariaHidden ? '' : 'Jovie'}
        aria-hidden={ariaHidden}
        data-testid={dataTestId}
        className={className}
      />
    );
  }

  // 'word' and 'wordAlt' are one wordmark now. 'full' and 'fullAlt' were mark
  // + wordmark; the wordmark's o is the mark, so a mark beside it would show
  // the O twice, and they draw the wordmark too.
  return wordmark(className, dataTestId);
}
