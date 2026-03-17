export interface IngestHistoryRow {
  readonly id: string;
  readonly type: string;
  readonly handle: string | null;
  readonly spotifyId: string | null;
  readonly result: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
}
