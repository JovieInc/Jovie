import type { MODE_IDS } from './phone-mode-content';

export interface PhoneShowcaseModeData {
  readonly id: (typeof MODE_IDS)[number];
  readonly headline: string;
  readonly description: string;
  readonly outcome: string;
  readonly summary: string;
}

export const PHONE_SHOWCASE_MODES: readonly PhoneShowcaseModeData[] = [
  {
    id: 'profile',
    headline: 'Keep the fan before they disappear.',
    description:
      'First-time visitors can subscribe fast. Returning fans see the next best action instead of a generic stack of links.',
    outcome: 'Grow',
    summary: 'Capture the fan first.',
  },
  {
    id: 'tour',
    headline: 'Show the closest show first.',
    description:
      'A fan in Los Angeles should not scroll through 30 cities. Jovie surfaces the nearest date and ticket button first.',
    outcome: 'Sell tickets',
    summary: 'Show the nearest date.',
  },
  {
    id: 'pay',
    headline: 'Turn in-person moments into revenue.',
    description:
      'When someone scans your QR code after a set, Jovie opens the fastest payment flow instead of another menu of links.',
    outcome: 'Earn',
    summary: 'Turn scans into payments.',
  },
  {
    id: 'listen',
    headline: 'Open the right streaming app instantly.',
    description:
      'A new listener taps once. Jovie routes them to Spotify, Apple Music, or YouTube Music without the usual friction.',
    outcome: 'Boost streams',
    summary: 'Open the right stream fast.',
  },
] as const;
