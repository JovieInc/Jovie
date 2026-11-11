'use client';

import { SegmentControl } from '@jovie/ui';
import {
  type RingLightMode,
  type RingLightSettings,
  ringLightKelvin,
} from '@/lib/teleprompter/ring-light';

interface StudioLightPanelProps {
  readonly settings: RingLightSettings;
  readonly onChange: (settings: RingLightSettings) => void;
}

type Preset<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly amount: number;
};

const MODE_OPTIONS = [
  { value: 'edges' as const, label: 'Edges' },
  { value: 'full' as const, label: 'Full White' },
];

const BRIGHTNESS = [
  { value: 'low', label: 'Low', amount: 0.5 },
  { value: 'mid', label: 'Mid', amount: 0.7 },
  { value: 'high', label: 'High', amount: 0.9 },
  { value: 'max', label: 'Max', amount: 1 },
] as const satisfies readonly Preset<string>[];

const WARMTH = [
  { value: 'cool', label: 'Cool', amount: 0 },
  { value: 'neutral', label: 'Neutral', amount: 0.45 },
  { value: 'warm', label: 'Warm', amount: 0.9 },
] as const satisfies readonly Preset<string>[];

const WIDTH = [
  { value: 'thin', label: 'Thin', amount: 16 },
  { value: 'medium', label: 'Medium', amount: 28 },
  { value: 'wide', label: 'Wide', amount: 56 },
] as const satisfies readonly Preset<string>[];

/** The preset closest to a stored value, so older saved settings still show one. */
function nearest<T extends string>(
  presets: readonly Preset<T>[],
  amount: number
): Preset<T> {
  return presets.reduce((best, preset) =>
    Math.abs(preset.amount - amount) < Math.abs(best.amount - amount)
      ? preset
      : best
  );
}

function PresetRow<T extends string>(props: {
  readonly label: string;
  readonly valueLabel: string;
  readonly presets: readonly Preset<T>[];
  readonly amount: number;
  readonly disabled?: boolean;
  readonly onChange: (amount: number) => void;
}) {
  const current = nearest(props.presets, props.amount);
  return (
    <div className='grid gap-1.5'>
      <p className='flex justify-between text-app text-secondary-token tabular-nums'>
        <span>{props.label}</span>
        <span>{props.valueLabel}</span>
      </p>
      <SegmentControl<T>
        aria-label={props.label}
        size='sm'
        semantics='radio'
        value={current.value}
        onValueChange={value => {
          const picked = props.presets.find(preset => preset.value === value);
          if (picked) props.onChange(picked.amount);
        }}
        options={props.presets.map(preset => ({
          value: preset.value,
          label: preset.label,
          disabled: props.disabled,
        }))}
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
      className='absolute grid w-72 gap-3 rounded-(--system-b-radius-overlay) border border-default bg-surface-3 p-4 text-primary-token shadow-xl'
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
        semantics='radio'
        value={settings.mode}
        onValueChange={mode => onChange({ ...settings, mode })}
        options={MODE_OPTIONS}
      />
      <PresetRow
        label='Brightness'
        valueLabel={`${Math.round(settings.brightness * 100)}%`}
        presets={BRIGHTNESS}
        amount={settings.brightness}
        onChange={brightness => onChange({ ...settings, brightness })}
      />
      <PresetRow
        label='Warmth'
        valueLabel={`${ringLightKelvin(settings.warmth)}K`}
        presets={WARMTH}
        amount={settings.warmth}
        onChange={warmth => onChange({ ...settings, warmth })}
      />
      <PresetRow
        label='Edge Width'
        valueLabel={`${settings.width}px`}
        presets={WIDTH}
        amount={settings.width}
        disabled={settings.mode === 'full'}
        onChange={width => onChange({ ...settings, width })}
      />
    </section>
  );
}
