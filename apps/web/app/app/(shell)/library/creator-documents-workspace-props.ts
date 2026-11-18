import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';

export type CreatorDocumentsWorkspaceProps = Readonly<{
  creatorProfileId: string;
  initialDocuments: readonly CreatorDocumentListItem[];
  initialDocumentId?: string | null;
  initialNextCursor?: string | null;
  initialLoadFailed?: boolean;
  onUnsavedDraftChange?: (hasDraft: boolean) => void;
  onDiscardDraftsReady?: (discard: (() => void) | null) => void;
}>;
