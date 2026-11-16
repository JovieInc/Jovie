'use client';

import { SegmentControl } from '@jovie/ui';
import type { ChangeEvent } from 'react';
import {
  RING_LIGHT_LIMITS,
  type RingLightMode,
  type RingLightSettings,
  ringLightKelvin,
} from '@/lib/teleprompter/ring-light';

interface StudioLightPanelProps {
  readonly settings: RingLightSettings;
  readonly onChange: (settings: RingLightSettings) => void;
}

const MODE_OPTIONS = [
  { value: 'edges' as const, label: 'Edges' },
  { value: 'full' as const, label: 'Full White' },
];

function Slider(props: {
  readonly id: string;
  readonly label: string;
  readonly valueLabel: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className='grid gap-1.5'>
      <label
        htmlFor={props.id}
        className='flex justify-between text-app text-secondary-token tabular-nums'
      >
        <span>{props.label}</span>
        <span>{props.valueLabel}</span>
      </label>
      <input
        id={props.id}
        type='range'
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          props.onChange(Number(event.target.value))
        }
        className='h-11 w-full cursor-pointer accent-(--color-accent) disabled:cursor-not-allowed disabled:opacity-45'
      />
    </div>
  );
}

export function StudioLightPanel({
  settings,
  onChange,
}: StudioLightPanelProps) {
  return (
    <section
      aria-label='Light'
      className='absolute grid w-64 gap-3 rounded-(--system-b-radius-overlay) border border-default bg-surface-3 p-4 text-primary-token shadow-xl'
      style={{
        right: 'calc(var(--studio-ring-width) + 16px)',
        bottom: 'calc(var(--studio-ring-width) + 84px)',
      }}
      data-testid='teleprompter-studio-light'
    >
      <h2 className='text-sm font-semibold text-balance'>Light</h2>
      <SegmentControl<RingLightMode>
        aria-label='Light Mode'
        size='sm'
        value={settings.mode}
        onValueChange={mode => onChange({ ...settings, mode })}
        options={MODE_OPTIONS}
      />
      <Slider
        id='studio-light-brightness'
        label='Brightness'
        valueLabel={`${Math.round(settings.brightness * 100)}%`}
        min={RING_LIGHT_LIMITS.brightness.min}
        max={RING_LIGHT_LIMITS.brightness.max}
        step={0.05}
        value={settings.brightness}
        onChange={brightness => onChange({ ...settings, brightness })}
      />
      <Slider
        id='studio-light-warmth'
        label='Warmth'
        valueLabel={`${ringLightKelvin(settings.warmth)}K`}
        min={RING_LIGHT_LIMITS.warmth.min}
        max={RING_LIGHT_LIMITS.warmth.max}
        step={0.05}
        value={settings.warmth}
        onChange={warmth => onChange({ ...settings, warmth })}
      />
      <Slider
        id='studio-light-width'
        label='Edge Width'
        valueLabel={`${settings.width}px`}
        min={RING_LIGHT_LIMITS.width.min}
        max={RING_LIGHT_LIMITS.width.max}
        step={2}
        value={settings.width}
        disabled={settings.mode === 'full'}
        onChange={width => onChange({ ...settings, width })}
      />
    </section>
  );
}
