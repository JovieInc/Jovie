'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { cn } from '@jovie/ui/lib/utils';
import DOMPurify from 'isomorphic-dompurify';
import React from 'react';

const sizeMap = { sm: 'sm', md: 'default', lg: 'lg' } as const;

export interface DSPButtonProps
  extends Omit<ButtonProps, 'children' | 'onClick'> {
  name: string;
  dspKey: string;
  url: string;
  backgroundColor: string;
  textColor: string;
  logoSvg: string;
  /**
   * Optional analytics hook that receives the provider key and resolved URL
   * before navigation occurs.
   */
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
  const handleClick = () => {
    if (disabled) return;
    if (onClick) {
      onClick(dspKey, url);
      return;
    }
    const isExternal = /^https?:\/\//i.test(url);
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
      variant='primary'
      className={cn(
        'w-full max-w-md gap-3 rounded-lg px-4 py-2 text-sm font-semibold',
        className
      )}
      style={{
        backgroundColor: disabled ? '#9CA3AF' : backgroundColor,
        color: disabled ? '#FFFFFF' : textColor,
      }}
      {...props}
    >
      <span
        className='flex items-center gap-2'
        style={{ color: disabled ? '#FFFFFF' : textColor }}
      >
        <span
          aria-hidden
          className='flex h-5 w-5 items-center justify-center'
          dangerouslySetInnerHTML={{ __html: sanitizedLogo }}
        />
        <span className='truncate'>Open in {name}</span>
      </span>
    </Button>
  );
}
