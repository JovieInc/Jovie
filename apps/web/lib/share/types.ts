import type { UTMContext, UTMParams } from '@/lib/utm';

export type ShareSurfaceType = 'blog' | 'profile' | 'release' | 'playlist';

export type PublicShareDestinationId =
  | 'copy_link'
  | 'instagram_story'
  | 'twitter'
  | 'threads'
  | 'email';

export interface ShareAssetSpec {
  readonly kind: 'story';
  readonly url: string;
  readonly fileName: string;
  readonly mimeType: 'image/png';
  readonly width: 1080;
  readonly height: 1920;
}

export interface ShareContext {
  readonly surfaceType: ShareSurfaceType;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly displayUrl: string;
  readonly imageUrl: string | null;
  readonly description?: string;
  readonly artistName?: string;
  readonly preparedText: string;
  readonly emailSubject: string;
  readonly emailBody: string;
  readonly asset: ShareAssetSpec;
  readonly utmContext: UTMContext;
}

export interface ShareLaunchResult {
  readonly status: 'success' | 'fallback' | 'error';
  readonly helperText?: string;
}

export interface PublicShareDestination {
  readonly id: PublicShareDestinationId;
  readonly label: string;
  readonly icon: string;
  readonly supportsPrefill: boolean;
  readonly supportsFileShare: boolean;
  readonly utmParams: UTMParams;
  launch: (context: ShareContext) => Promise<ShareLaunchResult>;
}

export type TrackedShareSourceGroup =
  | 'organic_social'
  | 'music'
  | 'paid'
  | 'email_pr'
  | 'other';

export interface TrackedShareSource {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly group: TrackedShareSourceGroup;
  readonly icon: string;
  readonly utmParams: UTMParams;
}
