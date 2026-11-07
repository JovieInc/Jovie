/**
 * Screen-as-ring-light settings. The studio paints its own edges so a
 * laptop screen lights the creator's face; nothing else on screen is bright.
 */

export type RingLightMode = 'edges' | 'full';

export interface RingLightSettings {
  readonly mode: RingLightMode;
  /** 0.3-1 */
  readonly brightness: number;
  /** 0 = cool daylight, 1 = warm tungsten */
  readonly warmth: number;
  /** Edge band in CSS px */
  readonly width: number;
}

export const DEFAULT_RING_LIGHT: RingLightSettings = {
  mode: 'edges',
  brightness: 0.9,
  warmth: 0.45,
  width: 28,
};

export const RING_LIGHT_LIMITS = {
  brightness: { min: 0.3, max: 1 },
  warmth: { min: 0, max: 1 },
  width: { min: 12, max: 96 },
} as const;

const COOL = [244, 248, 255] as const;
const WARM = [255, 214, 170] as const;
/** Kelvin labels for the warmth slider ends. */
const COOL_KELVIN = 6500;
const WARM_KELVIN = 3200;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function normalizeRingLight(
  input: Partial<RingLightSettings> | null | undefined
): RingLightSettings {
  return {
    mode: input?.mode === 'full' ? 'full' : 'edges',
    brightness: clamp(
      input?.brightness ?? DEFAULT_RING_LIGHT.brightness,
      RING_LIGHT_LIMITS.brightness.min,
      RING_LIGHT_LIMITS.brightness.max
    ),
    warmth: clamp(
      input?.warmth ?? DEFAULT_RING_LIGHT.warmth,
      RING_LIGHT_LIMITS.warmth.min,
      RING_LIGHT_LIMITS.warmth.max
    ),
    width: Math.round(
      clamp(
        input?.width ?? DEFAULT_RING_LIGHT.width,
        RING_LIGHT_LIMITS.width.min,
        RING_LIGHT_LIMITS.width.max
      )
    ),
  };
}

export function ringLightRgb(warmth: number): string {
  const t = clamp(warmth, 0, 1);
  return COOL.map((cool, index) =>
    Math.round(cool + ((WARM[index] ?? cool) - cool) * t)
  ).join(' ');
}

// Shown to people as a colour temperature, so round to the nearest step.
const KELVIN_STEP = 100;

export function ringLightKelvin(warmth: number): number {
  const t = clamp(warmth, 0, 1);
  const kelvin = COOL_KELVIN + (WARM_KELVIN - COOL_KELVIN) * t;
  return Math.round(kelvin / KELVIN_STEP) * KELVIN_STEP;
}

/** CSS custom properties consumed by the studio's ring layer. */
export function ringLightStyle(
  settings: RingLightSettings
): Record<`--${string}`, string> {
  return {
    '--studio-ring-rgb': ringLightRgb(settings.warmth),
    '--studio-ring-level': settings.brightness.toFixed(2),
    '--studio-ring-width': `${settings.width}px`,
  };
}

const STORAGE_KEY = 'jovie:teleprompter-studio:ring-light';

export function loadRingLight(storage?: Storage): RingLightSettings {
  try {
    const store = storage ?? globalThis.window?.localStorage;
    const raw = store?.getItem(STORAGE_KEY);
    return normalizeRingLight(
      raw ? (JSON.parse(raw) as RingLightSettings) : null
    );
  } catch {
    return DEFAULT_RING_LIGHT;
  }
}

export function saveRingLight(
  settings: RingLightSettings,
  storage?: Storage
): void {
  try {
    const store = storage ?? globalThis.window?.localStorage;
    store?.setItem(STORAGE_KEY, JSON.stringify(normalizeRingLight(settings)));
  } catch {
    // Private mode or blocked storage: the light still works for this session.
  }
}
