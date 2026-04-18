'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PressPhoto } from '@/types/press-photos';
import { STANDARD_CACHE } from './cache-strategies';
import {
  FetchError,
  fetchWithTimeout,
  fetchWithTimeoutResponse,
} from './fetch';
import { queryKeys } from './keys';

async function fetchPressPhotos(
  profileId: string,
  signal?: AbortSignal
): Promise<PressPhoto[]> {
  return fetchWithTimeout<PressPhoto[]>(
    `/api/dashboard/press-photos?profileId=${encodeURIComponent(profileId)}`,
    { signal }
  );
}

async function uploadPressPhoto(file: File): Promise<PressPhoto> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('photoType', 'press');

  const response = await fetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  const body = (await response
    .json()
    .catch(() => ({}))) as Partial<PressPhoto> & Record<string, unknown>;

  if (!response.ok) {
    throw new FetchError(
      typeof body.error === 'string'
        ? body.error
        : 'Failed to upload press photo',
      response.status,
      response,
      body
    );
  }

  if (typeof body.photoId !== 'string') {
    throw new FetchError('Upload failed: no photo ID returned', 500);
  }

  return {
    id: body.photoId,
    blobUrl: typeof body.blobUrl === 'string' ? body.blobUrl : null,
    smallUrl: typeof body.smallUrl === 'string' ? body.smallUrl : null,
    mediumUrl: typeof body.mediumUrl === 'string' ? body.mediumUrl : null,
    largeUrl: typeof body.largeUrl === 'string' ? body.largeUrl : null,
    originalFilename:
      typeof body.originalFilename === 'string'
        ? body.originalFilename
        : file.name,
    width: typeof body.width === 'number' ? body.width : null,
    height: typeof body.height === 'number' ? body.height : null,
    status: 'ready',
    sortOrder: 0,
  };
}

async function deletePressPhoto(photoId: string): Promise<void> {
  await fetchWithTimeoutResponse(`/api/images/press-photos/${photoId}`, {
    method: 'DELETE',
  });
}

export function usePressPhotosQuery(profileId: string) {
  return useQuery<PressPhoto[]>({
    queryKey: queryKeys.dashboard.pressPhotos(profileId),
    queryFn: ({ signal }) => fetchPressPhotos(profileId, signal),
    enabled: Boolean(profileId),
    ...STANDARD_CACHE,
  });
}

export function usePressPhotoUploadMutation(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadPressPhoto,
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.pressPhotos(profileId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
    },
    retry: false,
  });
}

export function useDeletePressPhotoMutation(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePressPhoto,
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.pressPhotos(profileId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
    },
    retry: false,
  });
}
