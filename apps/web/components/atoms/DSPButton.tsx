'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import DOMPurify from 'isomorphic-dompurify';
import { cn } from '@/lib/utils';

const sizeMap = { sm: 'sm', md: 'default', lg: 'lg' } as const;

export interface DSPButtonProps
  extends Omit<ButtonProps, 'children' | 'onClick' | 'size'> {
  name: string;
  dspKey: string;
  url: string;
  backgroundColor: string;
  textColor: string;
  logoSvg: string;
  onClick?: (dspKey: string, url: string) => void;
  size?: keyof typeof sizeMap;
}

/**
 * DSPButton integrates service provider branding with shared Button styles.
 */
export function DSPButton({
  name,
  dspKey,
  url,
  backgroundColor,
  textColor,
  logoSvg,
  onClick,
  className,
  size = 'md',
  disabled,
  ...props
}: DSPButtonProps) {
  const isExternal = /^https?:\/\//i.test(url);
  const handleClick = () => {
    if (disabled) return;
    if (onClick) {
      onClick(dspKey, url);
      return;
    }
    if (isExternal) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  };

  const sanitizedLogo = DOMPurify.sanitize(logoSvg, {
    USE_PROFILES: { svg: true },
  });

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      size={sizeMap[size]}
      aria-label={isExternal ? `Open in ${name} (opens in new tab)` : `Open in ${name}`}
      style={{
        backgroundColor: disabled ? '#9CA3AF' : backgroundColor,
        color: disabled ? '#FFFFFF' : textColor,
      }}
      className={cn('w-full max-w-md', className)}
      {...props}
    >
      <span className='inline-flex items-center gap-2'>
        <span
          className='shrink-0'
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for DSP embed content
          dangerouslySetInnerHTML={{ __html: sanitizedLogo }}
        />
        <span>Open in {name}</span>
      </span>
    </Button>
  );
}
