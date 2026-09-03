export interface LibraryRelationshipView {
  readonly id: string;
  readonly kind: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly status: 'suggested' | 'active' | 'rejected' | 'removed';
  readonly createdAt: string;
}

export interface YouTubeOptimizationSnapshot {
  readonly thumbnails: readonly {
    readonly id: string;
    readonly kind: string;
    readonly imageUrl: string;
    readonly approvalStatus: string;
    readonly experimentId: string | null;
    readonly detectedAt: string;
  }[];
  readonly metrics: readonly {
    readonly window: string;
    readonly views: number | null;
    readonly watchTimeMinutes: number | null;
    readonly avgViewDurationSeconds: number | null;
    readonly capturedAt: string;
  }[];
  readonly experiments: readonly {
    readonly id: string;
    readonly objective: string;
    readonly status: string;
    readonly winnerVariantKey: string | null;
  }[];
}
