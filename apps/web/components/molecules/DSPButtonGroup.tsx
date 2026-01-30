'use client';

import { DSPButton } from '@/components/atoms/DSPButton';
import type { AvailableDSP } from '@/lib/dsp';

export interface DSPButtonGroupProps {
  /** Array of available DSP platforms */
  readonly dsps: AvailableDSP[];
  /** Click handler for DSP buttons */
  readonly onDSPClick?: (dspKey: string, url: string) => void;
  /** Button size variant */
  readonly size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  readonly className?: string;
  /** Whether to show the preference notice */
  readonly showPreferenceNotice?: boolean;
  /** Custom preference notice text */
  readonly preferenceNoticeText?: string;
  /** Whether buttons are disabled */
  readonly disabled?: boolean;
}

export function DSPButtonGroup({
  dsps,
  onDSPClick,
  size = 'md',
  className = '',
  showPreferenceNotice = true,
  preferenceNoticeText = 'Your preference will be saved for next time',
  disabled = false,
}: DSPButtonGroupProps) {
  if (!dsps?.length) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className='text-gray-500 text-sm'>
          No streaming platforms available
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {dsps.map(dsp => (
        <DSPButton
          key={dsp.key}
          name={dsp.name}
          dspKey={dsp.key}
          url={dsp.url}
          backgroundColor={dsp.config.color}
          textColor={dsp.config.textColor}
          logoSvg={dsp.config.logoSvg}
          onClick={onDSPClick}
          size={size}
          disabled={disabled}
        />
      ))}
      {showPreferenceNotice && (
        <p className='text-xs text-gray-500 text-center'>
          {preferenceNoticeText}
        </p>
      )}
    </div>
  );
}
