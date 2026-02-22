'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FetchError, fetchWithTimeout } from '@/lib/queries/fetch';
import {
  useDashboardSocialLinksQuery,
  useSaveSocialLinksMutation,
} from '@/lib/queries/useDashboardSocialLinksQuery';
import {
  getPlatform,
  normalizeUrl,
  validateUrl,
} from '@/lib/utils/platform-detection';
import type {
  SocialLink,
  UseSocialsFormReturn,
  VerificationError,
  VerificationErrorCode,
} from './types';

const DEFAULT_PLATFORMS = ['instagram', 'tiktok', 'youtube'] as const;

/** DSPs managed via the dedicated connections UI — exclude from social links. */
export const PRIMARY_DSP_IDS = new Set(['spotify', 'apple_music']);

const KNOWN_ERROR_CODES = new Set<string>([
  'dns_not_found',
  'domain_already_claimed',
  'invalid_url',
  'rate_limited',
  'server_error',
]);

function toVerificationErrorCode(
  code: string | undefined
): VerificationErrorCode {
  if (code && KNOWN_ERROR_CODES.has(code)) {
    return code as VerificationErrorCode;
  }
  return 'server_error';
}

interface UseSocialsFormOptions {
  artistId: string;
}

export function useSocialsForm({
  artistId,
}: UseSocialsFormOptions): UseSocialsFormReturn {
  // Local state for editing links (initialized from query data)
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // TanStack Query for fetching social links
  const {
    data: fetchedLinks,
    isLoading: isFetching,
    error: fetchError,
  } = useDashboardSocialLinksQuery(artistId);

  // TanStack Query mutation for saving social links
  const {
    mutateAsync: saveMutation,
    isPending: isSaving,
    isSuccess,
    reset: resetMutation,
  } = useSaveSocialLinksMutation(artistId);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [verifyingLinkId, setVerifyingLinkId] = useState<string | null>(null);
  const [verificationError, setVerificationError] =
    useState<VerificationError | null>(null);

  // Sync fetched data to local state when it changes.
  // Sync fetched links into local state only when the local state hasn't been
  // touched yet (empty array). This prevents background refetches from
  // clobbering in-progress user edits.
  const initializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fetchedLinks || initializedRef.current === artistId) return;
    initializedRef.current = artistId;
    if (fetchedLinks.length === 0) {
      setSocialLinks(
        DEFAULT_PLATFORMS.map(platform => ({ id: '', platform, url: '' }))
      );
    } else {
      setSocialLinks(
        fetchedLinks
          .filter(link => !PRIMARY_DSP_IDS.has(link.platform))
          .map(link => ({
            ...link,
            verificationStatus: link.verificationStatus ?? 'unverified',
            verificationToken: link.verificationToken ?? null,
          }))
      );
    }
  }, [artistId, fetchedLinks]);

  // Auto-clear success state after 3 seconds
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        resetMutation();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, resetMutation]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(undefined);

      const linksToInsert = socialLinks
        .filter(link => link.url.trim())
        .map((link, index) => {
          const normalizedUrl = normalizeUrl(link.url.trim());
          const platform = link.platform === 'twitter' ? 'x' : link.platform;
          return {
            platform,
            platformType: platform,
            url: normalizedUrl,
            sortOrder: index,
            isActive: true,
            verificationStatus: link.verificationStatus,
            verificationToken: link.verificationToken,
          };
        });

      const websiteCount = linksToInsert.filter(
        link => link.platform === 'website'
      ).length;
      if (websiteCount > 1) {
        setSubmitError('You can only add one official website link.');
        return;
      }

      for (const link of linksToInsert) {
        const platform = getPlatform(link.platform);
        if (!platform) continue;
        if (!validateUrl(link.url, platform)) {
          setSubmitError(`Please enter a valid ${platform.name} link.`);
          return;
        }
      }

      await saveMutation({ profileId: artistId, links: linksToInsert });
    },
    [artistId, socialLinks, saveMutation]
  );

  const removeSocialLink = useCallback((index: number) => {
    setSocialLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateSocialLink = useCallback(
    (index: number, field: keyof SocialLink, value: string) => {
      setSocialLinks(prev => {
        const updatedLinks = [...prev];
        updatedLinks[index] = { ...updatedLinks[index], [field]: value };
        return updatedLinks;
      });
    },
    []
  );

  const scheduleNormalize = useCallback((index: number, raw: string) => {
    const key = `${index}-url`;
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
    }
    timers.current[key] = setTimeout(() => {
      try {
        const norm = normalizeUrl(raw.trim());
        setSocialLinks(prev => {
          const next = [...prev];
          if (!next[index]) return prev;
          if (next[index].url === norm) return prev;
          next[index] = { ...next[index], url: norm };
          return next;
        });
      } catch {
        // ignore
      }
    }, 500);
  }, []);

  const handleUrlBlur = useCallback((index: number) => {
    setSocialLinks(prev => {
      const next = [...prev];
      if (!next[index]) return prev;
      const norm = normalizeUrl((next[index].url || '').trim());
      if (next[index].url === norm) return prev;
      next[index] = { ...next[index], url: norm };
      return next;
    });
  }, []);

  const addSocialLink = useCallback(() => {
    setSocialLinks(prev => [
      ...prev,
      { id: '', platform: 'instagram', url: '' },
    ]);
  }, []);

  const clearVerificationError = useCallback(() => {
    setVerificationError(null);
  }, []);

  const verifyWebsite = useCallback(
    async (linkId: string) => {
      if (!linkId) return;
      setVerifyingLinkId(linkId);
      setSubmitError(undefined);
      setVerificationError(null);
      try {
        const response = await fetchWithTimeout<{
          ok: boolean;
          status: 'pending' | 'verified';
          code?: string;
          error?: string;
        }>('/api/dashboard/social-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: artistId, linkId }),
        });

        setSocialLinks(prev =>
          prev.map(link =>
            link.id === linkId
              ? { ...link, verificationStatus: response.status }
              : link
          )
        );

        // Handle structured error codes from the backend
        if (!response.ok && response.code) {
          setVerificationError({
            code: toVerificationErrorCode(response.code),
            message: response.error ?? 'Verification failed.',
          });
        }
      } catch (err) {
        // Try to extract structured error from FetchError response body
        if (err instanceof FetchError && err.response) {
          try {
            const body = await err.response.clone().json();
            if (body && typeof body === 'object' && 'code' in body) {
              setVerificationError({
                code: toVerificationErrorCode(body.code as string),
                message: (body.error as string) ?? 'Verification failed.',
              });
              return;
            }
          } catch {
            // JSON parse failed, fall through to generic error
          }
        }
        setVerificationError({
          code: 'server_error',
          message: 'We could not verify your website. Please try again.',
        });
      } finally {
        setVerifyingLinkId(null);
      }
    },
    [artistId]
  );

  return {
    loading: isFetching || isSaving,
    error:
      submitError || (fetchError ? 'Failed to load social links' : undefined),
    success: isSuccess,
    socialLinks,
    handleSubmit,
    removeSocialLink,
    updateSocialLink,
    scheduleNormalize,
    handleUrlBlur,
    addSocialLink,
    verifyWebsite,
    verifyingLinkId,
    verificationError,
    clearVerificationError,
  };
}
