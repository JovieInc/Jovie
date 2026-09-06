export interface YouTubeThumbnailHistoryView {
  readonly id: string;
  readonly kind: 'original' | 'previous' | 'current' | 'candidate';
  readonly imageUrl: string;
  readonly approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  readonly experimentId: string | null;
  readonly detectedAt: string;
}

export interface YouTubeMetricView {
  readonly window:
    | 'day_1'
    | 'day_7'
    | 'day_28'
    | 'day_90'
    | 'lifetime'
    | 'experiment';
  readonly views: number | null;
  readonly watchTimeMinutes: number | null;
  readonly avgViewDurationSeconds: number | null;
  readonly capturedAt: string;
}

export interface YouTubeExperimentView {
  readonly id: string;
  readonly objective: string;
  readonly status: 'draft' | 'running' | 'paused' | 'decided' | 'cancelled';
  readonly winnerVariantKey: string | null;
  readonly variants: Record<string, unknown>;
  readonly decisionEvidence: Record<string, unknown> | null;
}

export interface YouTubeOptimizationSnapshot {
  readonly thumbnails: readonly YouTubeThumbnailHistoryView[];
  readonly metrics: readonly YouTubeMetricView[];
  readonly experiments: readonly YouTubeExperimentView[];
}
