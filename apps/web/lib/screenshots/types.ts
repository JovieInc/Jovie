export type ScreenshotGroup =
  | 'marketing'
  | 'onboarding'
  | 'dashboard'
  | 'settings'
  | 'public-profile';

export type ScreenshotViewport = 'desktop' | 'mobile';

export type ScreenshotTheme = 'default' | 'dark';

export type ScreenshotConsumer =
  | 'admin'
  | 'marketing-export'
  | 'investor-ready';

export type ScreenshotInteraction = 'none' | 'open-first-release';

export type ScreenshotCaptureTarget = 'page' | 'locator';

export interface ScreenshotScenario {
  readonly id: string;
  readonly title: string;
  readonly group: ScreenshotGroup;
  readonly groupLabel: string;
  readonly route: string;
  readonly waitFor: string;
  readonly viewport: ScreenshotViewport;
  readonly theme: ScreenshotTheme;
  readonly consumers: readonly ScreenshotConsumer[];
  readonly fullPage: boolean;
  readonly captureTarget?: ScreenshotCaptureTarget;
  readonly captureSelector?: string;
  readonly interaction?: ScreenshotInteraction;
  readonly publicExportPath?: string;
}

export interface ScreenshotManifestEntry {
  readonly id: string;
  readonly title: string;
  readonly group: ScreenshotGroup;
  readonly groupLabel: string;
  readonly route: string;
  readonly viewport: ScreenshotViewport;
  readonly theme: ScreenshotTheme;
  readonly consumers: readonly ScreenshotConsumer[];
  readonly capturedAt: string;
  readonly gitSha: string | null;
  readonly imagePath: string;
  readonly publicExportPath?: string;
}

export interface ScreenshotCatalogEntry extends ScreenshotManifestEntry {
  readonly sizeBytes: number;
  readonly url: string;
  readonly publicUrl?: string;
}
