export interface LogoVisibleBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LogoCropInset {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface LogoAssetProvenance {
  readonly source: string;
  readonly version: string;
  readonly measuredAt: string;
  readonly measurement: 'alpha' | 'vector-raster-alpha';
}

export interface LogoOpticalOverride {
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly evidenceRef: string;
  readonly reason: string;
  readonly confidence: number;
  readonly rollback: string;
}

export interface LogoAssetNormalization {
  readonly id: string;
  readonly visibleBounds: LogoVisibleBounds;
  readonly cropInset: LogoCropInset;
  readonly targetInkHeight: number;
  readonly opticalScale: number;
  readonly baselineOffsetY: number;
  readonly opticalOffsetX: number;
  readonly allowedOverflow: number;
  readonly provenance: LogoAssetProvenance;
  readonly opticalOverride?: LogoOpticalOverride;
}

export interface NormalizedLogoLayout {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly inkWidth: number;
  readonly inkHeight: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly scale: number;
  readonly renderedCanvasWidth: number;
  readonly renderedCanvasHeight: number;
  readonly translateX: number;
  readonly translateY: number;
}

export function resolveNormalizedLogoLayout(
  asset: LogoAssetNormalization
): NormalizedLogoLayout {
  const { visibleBounds, cropInset } = asset;
  const canvasWidth = cropInset.left + visibleBounds.width + cropInset.right;
  const canvasHeight = cropInset.top + visibleBounds.height + cropInset.bottom;
  const scale =
    (asset.targetInkHeight * asset.opticalScale) / visibleBounds.height;

  return {
    canvasWidth,
    canvasHeight,
    inkWidth: visibleBounds.width * scale,
    inkHeight: visibleBounds.height * scale,
    frameWidth: visibleBounds.width * scale + asset.allowedOverflow * 2,
    frameHeight: visibleBounds.height * scale + asset.allowedOverflow * 2,
    scale,
    renderedCanvasWidth: canvasWidth * scale,
    renderedCanvasHeight: canvasHeight * scale,
    translateX:
      asset.allowedOverflow + asset.opticalOffsetX - visibleBounds.x * scale,
    translateY:
      asset.allowedOverflow + asset.baselineOffsetY - visibleBounds.y * scale,
  };
}

export function normalizedLogoStyle(
  asset: LogoAssetNormalization
): Readonly<Record<string, string>> {
  const layout = resolveNormalizedLogoLayout(asset);
  return {
    '--logo-ink-height': `${layout.inkHeight}px`,
    '--logo-frame-width': `${layout.frameWidth}px`,
    '--logo-frame-height': `${layout.frameHeight}px`,
    '--logo-render-width': `${layout.renderedCanvasWidth}px`,
    '--logo-render-height': `${layout.renderedCanvasHeight}px`,
    '--logo-offset-x': `${layout.translateX}px`,
    '--logo-offset-y': `${layout.translateY}px`,
    '--logo-allowed-overflow': `${asset.allowedOverflow}px`,
  };
}
