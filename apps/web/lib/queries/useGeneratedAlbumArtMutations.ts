'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ApplyGeneratedAlbumArtInput {
  readonly profileId: string;
  readonly releaseId: string;
  readonly generationId: string;
  readonly candidateId: string;
}

interface ApplyGeneratedAlbumArtResponse {
  readonly releaseId: string;
  readonly artworkUrl: string;
  readonly sizes: Record<string, string>;
}

export interface CreateReleaseWithGeneratedAlbumArtInput {
  readonly profileId: string;
  readonly title: string;
  readonly releaseType:
    | 'single'
    | 'ep'
    | 'album'
    | 'compilation'
    | 'live'
    | 'mixtape'
    | 'other';
  readonly releaseDate?: string;
  readonly generationId: string;
  readonly candidateId: string;
}

interface CreateReleaseWithGeneratedAlbumArtResponse
  extends ApplyGeneratedAlbumArtResponse {
  readonly title: string;
  readonly slug: string;
}

export function useApplyGeneratedAlbumArtMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<
      ApplyGeneratedAlbumArtInput,
      ApplyGeneratedAlbumArtResponse
    >('/api/chat/album-art/apply', 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.releases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: error => {
      handleMutationError(error, 'Failed to apply album art');
    },
  });
}

export function useCreateReleaseWithGeneratedAlbumArtMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMutationFn<
      CreateReleaseWithGeneratedAlbumArtInput,
      CreateReleaseWithGeneratedAlbumArtResponse
    >('/api/chat/album-art/create-release-and-apply', 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.releases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: error => {
      handleMutationError(error, 'Failed to create release with album art');
    },
  });
}
