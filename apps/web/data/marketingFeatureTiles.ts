import type { AccentPaletteName } from '@/lib/ui/accent-palette';

interface MarketingFeatureTileBase {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly size: 'large' | 'small';
  readonly accent: AccentPaletteName;
  readonly kicker?: string;
  readonly layoutClassName: string;
}

export interface MarketingScreenshotFeatureTile
  extends MarketingFeatureTileBase {
  readonly visual: 'cropped-screenshot' | 'screenshot' | 'share-menu-crop';
  readonly screenshotSrc: string;
  readonly screenshotAlt: string;
  readonly screenshotWidth?: number;
  readonly screenshotHeight?: number;
  readonly frameClassName?: string;
  readonly imageClassName?: string;
  readonly objectPosition?: string;
}

export interface MarketingButtonChipFeatureTile
  extends MarketingFeatureTileBase {
  readonly visual: 'button-chip';
  readonly chipIcon?: 'download' | 'sound';
  readonly chipLabel: string;
}

export interface MarketingIconBadgeFeatureTile
  extends MarketingFeatureTileBase {
  readonly visual: 'icon-badge';
  readonly badgeIcon: 'speed' | 'sync' | 'chart';
  readonly badgeLabel: string;
}

export interface MarketingMockPopoverFeatureTile
  extends MarketingFeatureTileBase {
  readonly visual: 'mock-popover';
  readonly popoverLabel: string;
  readonly popoverItems: readonly string[];
}

export type MarketingFeatureTile =
  | MarketingButtonChipFeatureTile
  | MarketingIconBadgeFeatureTile
  | MarketingMockPopoverFeatureTile
  | MarketingScreenshotFeatureTile;
