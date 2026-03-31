export interface PressPhoto {
  readonly id: string;
  readonly blobUrl: string | null;
  readonly smallUrl: string | null;
  readonly mediumUrl: string | null;
  readonly largeUrl: string | null;
  readonly originalFilename: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly status: 'draft' | 'uploading' | 'processing' | 'ready' | 'failed';
  readonly sourcePlatform?: string | null;
  readonly sortOrder: number;
}
