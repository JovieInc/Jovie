import type { CreatorDocumentContent } from '@/lib/db/schema/creator-documents';

export type CreatorDocumentListItem = {
  readonly id: string;
  readonly title: string;
  readonly kind: 'idea' | 'research' | 'script';
  readonly stage:
    | 'private_draft'
    | 'evidence_review'
    | 'creator_approved'
    | 'capture_ready';
  readonly currentRevision: number;
  readonly content: CreatorDocumentContent;
  readonly plainText: string;
  readonly updatedAt: string;
};

export type CreatorDocumentPage = {
  readonly documents: readonly CreatorDocumentListItem[];
  readonly nextCursor: string | null;
};
