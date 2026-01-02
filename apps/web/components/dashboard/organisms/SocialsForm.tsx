'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { FormField } from '@/components/molecules/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { track } from '@/lib/analytics';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { Artist } from '@/types/db';

interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

interface SocialsFormProps {
  artist: Artist;
}

export function SocialsForm({ artist }: SocialsFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    const fetchSocialLinks = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/social-links?profileId=${encodeURIComponent(
            artist.id
          )}`,
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
  }, [artist.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    setSuccess(false);

    try {
      // Insert new social links via server API
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
        body: JSON.stringify({ profileId: artist.id, links: linksToInsert }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err?.error ?? 'Failed to update social links');
      }
      setSuccess(true);
      track('dashboard_social_links_saved', { profileId: artist.id });
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to update social links');
    } finally {
      setLoading(false);
    }
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const updateSocialLink = (
    index: number,
    field: keyof SocialLink,
    value: string
  ) => {
    const updatedLinks = [...socialLinks];
    updatedLinks[index] = { ...updatedLinks[index], [field]: value };
    setSocialLinks(updatedLinks);
  };

  const scheduleNormalize = (index: number, raw: string) => {
    const key = `${index}-url`;
    if (timers.current[key]) {
      window.clearTimeout(timers.current[key]);
    }
    timers.current[key] = window.setTimeout(() => {
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
  };

  const handleUrlBlur = (index: number) => {
    setSocialLinks(prev => {
      const next = [...prev];
      if (!next[index]) return prev;
      const norm = normalizeUrl((next[index].url || '').trim());
      if (next[index].url === norm) return prev;
      next[index] = { ...next[index], url: norm };
      return next;
    });
  };

  if (loading) {
    return (
      <div className='space-y-4'>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className='h-16 bg-surface-2 rounded-lg animate-pulse motion-reduce:animate-none'
          />
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-4' data-testid='socials-form'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-primary-token'>
          Social Media Links
        </h3>
        <Button
          type='button'
          variant='secondary'
          onClick={() =>
            setSocialLinks([
              ...socialLinks,
              { id: '', platform: 'instagram', url: '' },
            ])
          }
          className='text-sm whitespace-nowrap'
        >
          Add Link
        </Button>
      </div>

      {socialLinks.length === 0 ? (
        <EmptyState
          icon={<Share2 className='h-6 w-6' aria-hidden='true' />}
          heading='No social links yet'
          description='Connect Instagram, TikTok, Twitter, and other platforms to build your fan community.'
          action={{
            label: 'Add first link',
            onClick: () =>
              setSocialLinks([{ id: '', platform: 'instagram', url: '' }]),
          }}
        />
      ) : (
        <div className='space-y-4'>
          {socialLinks.map((link, index) => (
            <div
              key={link.id}
              className='flex items-center space-x-3 p-4 border border-subtle rounded-lg'
            >
              <FormField label='Platform' className='w-32'>
                <Select
                  value={link.platform}
                  onValueChange={value =>
                    updateSocialLink(index, 'platform', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select platform' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='instagram'>Instagram</SelectItem>
                    <SelectItem value='twitter'>Twitter</SelectItem>
                    <SelectItem value='tiktok'>TikTok</SelectItem>
                    <SelectItem value='youtube'>YouTube</SelectItem>
                    <SelectItem value='facebook'>Facebook</SelectItem>
                    <SelectItem value='linkedin'>LinkedIn</SelectItem>
                    <SelectItem value='website'>Website</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <Input
                type='url'
                value={link.url}
                onChange={e => {
                  const v = e.target.value;
                  updateSocialLink(index, 'url', v);
                  scheduleNormalize(index, v);
                }}
                onBlur={() => handleUrlBlur(index)}
                placeholder='https://...'
                inputMode='url'
                autoCapitalize='none'
                autoCorrect='off'
                autoComplete='off'
                className='flex-1'
              />

              <Button
                type='button'
                variant='secondary'
                onClick={() => removeSocialLink(index)}
                className='text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
              >
                Remove
              </Button>
            </div>
          ))}

          <Button
            onClick={handleSubmit}
            disabled={loading}
            variant='primary'
            className='w-full'
          >
            {loading ? 'Saving...' : 'Save Social Links'}
          </Button>
        </div>
      )}

      {error && (
        <div className='bg-red-500/10 border border-red-500/20 rounded-lg p-3'>
          <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
        </div>
      )}

      {success && (
        <div className='bg-green-500/10 border border-green-500/20 rounded-lg p-3'>
          <p className='text-sm text-green-600 dark:text-green-400'>
            Social links saved successfully!
          </p>
        </div>
      )}
    </div>
  );
}
