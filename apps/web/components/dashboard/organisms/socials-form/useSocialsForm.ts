'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { SocialLink, UseSocialsFormReturn } from './types';

interface UseSocialsFormOptions {
  artistId: string;
}

export function useSocialsForm({
  artistId,
}: UseSocialsFormOptions): UseSocialsFormReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const fetchSocialLinks = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/social-links?profileId=${encodeURIComponent(artistId)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err?.error ?? 'Failed to fetch social links');
        }
        const json: { links: SocialLink[] } = await res.json();
        setSocialLinks(json.links || []);
      } catch (error) {
        console.error('Error:', error);
      }
    };

    fetchSocialLinks();
  }, [artistId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(undefined);
      setSuccess(false);

      try {
        const linksToInsert = socialLinks
          .filter(link => link.url.trim())
          .map((link, index) => ({
            platform: link.platform,
            platformType: link.platform,
            url: link.url.trim(),
            sortOrder: index,
            isActive: true,
          }));

        const res = await fetch('/api/dashboard/social-links', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: artistId, links: linksToInsert }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err?.error ?? 'Failed to update social links');
        }
        setSuccess(true);
        track('dashboard_social_links_saved', { profileId: artistId });
        setTimeout(() => setSuccess(false), 3000);
      } catch (error) {
        console.error('Error:', error);
        setError('Failed to update social links');
      } finally {
        setLoading(false);
      }
    },
    [artistId, socialLinks]
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

  return {
    loading,
    error,
    success,
    socialLinks,
    handleSubmit,
    removeSocialLink,
    updateSocialLink,
    scheduleNormalize,
    handleUrlBlur,
    addSocialLink,
  };
}
