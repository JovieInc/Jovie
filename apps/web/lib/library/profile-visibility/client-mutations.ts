'use client';

import {
  isLibraryProfileVisibility,
  type LibraryProfileItemKind,
  type LibraryProfileVisibility,
} from '@/lib/library/profile-visibility';

export async function updateLibraryProfileVisibility(input: {
  readonly profileId: string;
  readonly assetId: string;
  readonly itemKind: LibraryProfileItemKind;
  readonly profileVisibility: LibraryProfileVisibility;
}): Promise<LibraryProfileVisibility> {
  const response = await fetch('/api/library/profile-visibility', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Profile visibility update failed');
  }

  const payload = (await response.json()) as {
    readonly profileVisibility?: string;
  };
  if (!isLibraryProfileVisibility(payload.profileVisibility)) {
    throw new Error('Profile visibility update missing payload');
  }

  return payload.profileVisibility;
}
