import { listCreatorDocuments } from './store';

export async function loadLibraryDocuments(profileId: string, requestedId: string | null) {
  const page = await listCreatorDocuments(profileId);
  if (!requestedId || !page.nextCursor || page.documents.some(item => item.id === requestedId)) {
    return page;
  }

  const selected = await listCreatorDocuments(profileId, { documentId: requestedId });
  return { ...page, documents: [...page.documents, ...selected.documents] };
}
