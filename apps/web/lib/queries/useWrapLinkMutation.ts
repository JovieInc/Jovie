'use client';

import { useMutation } from '@tanstack/react-query';
import { createMutationFn } from './fetch';

export interface WrapLinkInput {
  url: string;
  platform: string;
}

export interface WrapLinkResponse {
  shortId: string;
  kind: 'normal' | 'sensitive';
  titleAlias?: string;
}

const wrapLink = createMutationFn<WrapLinkInput, WrapLinkResponse>(
  '/api/wrap-link',
  'POST'
);

/**
 * TanStack Query mutation hook for wrapping external links.
 *
 * Wraps external URLs with tracking/anti-cloaking protection,
 * returning a short ID and metadata about the link type.
 *
 * @example
 * const { mutate: wrapLink, isPending } = useWrapLinkMutation();
 *
 * wrapLink(
 *   { url: 'https://example.com', platform: 'custom' },
 *   {
 *     onSuccess: (data) => {
 *       const wrappedUrl = data.kind === 'sensitive'
 *         ? `/out/${data.shortId}`
 *         : `/go/${data.shortId}`;
 *     },
 *     onError: () => {
 *       // Fallback to original URL
 *     },
 *   }
 * );
 */
export function useWrapLinkMutation() {
  return useMutation({
    mutationFn: wrapLink,
  });
}
