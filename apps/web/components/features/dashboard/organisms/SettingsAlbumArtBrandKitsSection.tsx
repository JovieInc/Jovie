'use client';

import { Input } from '@jovie/ui';
import { Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createArtistAlbumArtBrandKit,
  deleteArtistAlbumArtBrandKit,
  getArtistAlbumArtBrandKits,
  updateArtistAlbumArtBrandKit,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import type { AlbumArtBrandKitRecord } from '@/lib/services/album-art/types';
import type { Artist } from '@/types';

const INPUT_CLASS =
  'h-[32px] rounded-[8px] border border-subtle bg-surface-0 px-3 text-[12px] text-primary-token';

interface SettingsAlbumArtBrandKitsSectionProps {
  readonly artist: Artist;
}

export function SettingsAlbumArtBrandKitsSection({
  artist,
}: SettingsAlbumArtBrandKitsSectionProps) {
  const [brandKits, setBrandKits] = useState<AlbumArtBrandKitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [logoAssetUrl, setLogoAssetUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<
    'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >('top-left');
  const [logoOpacity, setLogoOpacity] = useState(0.9);
  const [isDefault, setIsDefault] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadBrandKits = useCallback(async () => {
    setIsLoading(true);
    try {
      setBrandKits(await getArtistAlbumArtBrandKits());
    } catch {
      toast.error('Failed to load album art brand kits.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrandKits();
  }, [loadBrandKits]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setLogoAssetUrl(null);
    setLogoPosition('top-left');
    setLogoOpacity(0.9);
    setIsDefault(true);
  }, []);

  const handleUploadLogo = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `/api/images/brand-kit-logo/upload?profileId=${encodeURIComponent(artist.id)}`,
        {
          method: 'POST',
          body: formData,
        }
      );
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(error?.error ?? 'Failed to upload logo');
      }

      const payload = (await response.json()) as { logoUrl: string };
      setLogoAssetUrl(payload.logoUrl);
      return payload.logoUrl;
    },
    [artist.id]
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Brand kit name is required.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateArtistAlbumArtBrandKit({
          brandKitId: editingId,
          name,
          logoAssetUrl,
          logoPosition,
          logoOpacity,
          isDefault,
        });
      } else {
        await createArtistAlbumArtBrandKit({
          name,
          logoAssetUrl,
          logoPosition,
          logoOpacity,
          isDefault,
        });
      }

      await loadBrandKits();
      resetForm();
      toast.success('Brand kit saved.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save brand kit.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    editingId,
    isDefault,
    loadBrandKits,
    logoAssetUrl,
    logoOpacity,
    logoPosition,
    name,
    resetForm,
  ]);

  return (
    <SettingsPanel
      title='Album Art Brand Kits'
      description='Save one repeatable text and logo format for singles, remixes, and label-style release families.'
    >
      <div className='space-y-4 px-4 py-4 sm:px-5'>
        <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]'>
          <Input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder='Series Name'
            className={INPUT_CLASS}
          />
          <select
            value={logoPosition}
            onChange={event =>
              setLogoPosition(
                event.target.value as
                  | 'top-left'
                  | 'top-right'
                  | 'bottom-left'
                  | 'bottom-right'
              )
            }
            className={INPUT_CLASS}
          >
            <option value='top-left'>Top Left</option>
            <option value='top-right'>Top Right</option>
            <option value='bottom-left'>Bottom Left</option>
            <option value='bottom-right'>Bottom Right</option>
          </select>
          <div className='flex items-center gap-2 rounded-[8px] border border-subtle bg-surface-0 px-3'>
            <span className='text-[11px] text-secondary-token'>Opacity</span>
            <input
              type='range'
              min='0.2'
              max='1'
              step='0.05'
              value={logoOpacity}
              onChange={event => setLogoOpacity(Number(event.target.value))}
              className='w-full'
            />
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-3'>
          <label className='inline-flex items-center gap-2 text-[12px] text-primary-token'>
            <input
              type='checkbox'
              checked={isDefault}
              onChange={event => setIsDefault(event.target.checked)}
            />
            <span>Set As Default Series Template</span>
          </label>
          <label className='inline-flex cursor-pointer items-center gap-2 rounded-[9px] border border-subtle bg-surface-0 px-3 py-2 text-[12px] text-primary-token transition-colors hover:bg-surface-1'>
            <input
              type='file'
              accept='image/png,image/svg+xml'
              className='hidden'
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void handleUploadLogo(file).catch(error => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Failed to upload logo.'
                  );
                });
              }}
            />
            <span>Upload Logo</span>
          </label>
          {logoAssetUrl ? (
            <>
              <div className='relative h-12 w-12 overflow-hidden rounded-[10px] border border-subtle bg-surface-0'>
                <Image
                  src={logoAssetUrl}
                  alt='Brand kit logo'
                  fill
                  className='object-contain p-2'
                  unoptimized
                />
              </div>
              <button
                type='button'
                onClick={() => setLogoAssetUrl(null)}
                className='inline-flex h-8 items-center rounded-[9px] border border-subtle px-3 text-[12px] text-primary-token'
              >
                Remove Logo
              </button>
            </>
          ) : null}
          <button
            type='button'
            onClick={() => void handleSave()}
            disabled={isSaving}
            className='inline-flex h-8 items-center gap-2 rounded-[9px] bg-primary-token px-3 text-[12px] font-[560] text-white disabled:opacity-60'
          >
            {isSaving ? <LoadingSpinner size='sm' /> : null}
            <span>{editingId ? 'Update Brand Kit' : 'Save Brand Kit'}</span>
          </button>
          {editingId ? (
            <button
              type='button'
              onClick={resetForm}
              className='inline-flex h-8 items-center rounded-[9px] border border-subtle px-3 text-[12px] text-primary-token'
            >
              Cancel
            </button>
          ) : null}
        </div>

        <div className='space-y-2'>
          {isLoading ? (
            <div className='flex items-center gap-2 text-[12px] text-secondary-token'>
              <LoadingSpinner size='sm' />
              <span>Loading brand kits...</span>
            </div>
          ) : brandKits.length === 0 ? (
            <p className='text-[12px] text-secondary-token'>
              No brand kits yet. Save one to keep a uniform text and logo system
              across releases.
            </p>
          ) : (
            brandKits.map(brandKit => (
              <div
                key={brandKit.id}
                className='flex items-center justify-between gap-3 rounded-[12px] border border-subtle bg-surface-0 px-3 py-2.5'
              >
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='truncate text-[13px] font-[560] text-primary-token'>
                      {brandKit.name}
                    </p>
                    {brandKit.isDefault ? (
                      <span className='rounded-full bg-surface-1 px-2 py-0.5 text-[10px] text-secondary-token'>
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className='mt-1 text-[11px] text-secondary-token'>
                    {brandKit.logoPosition.replace('-', ' ')} ·{' '}
                    {Math.round(brandKit.logoOpacity * 100)}% opacity
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => {
                      setEditingId(brandKit.id);
                      setName(brandKit.name);
                      setLogoAssetUrl(brandKit.logoAssetUrl);
                      setLogoPosition(brandKit.logoPosition);
                      setLogoOpacity(brandKit.logoOpacity);
                      setIsDefault(brandKit.isDefault);
                    }}
                    className='inline-flex h-8 items-center rounded-[9px] border border-subtle px-3 text-[12px] text-primary-token'
                  >
                    Edit
                  </button>
                  <button
                    type='button'
                    onClick={() =>
                      void deleteArtistAlbumArtBrandKit(brandKit.id)
                        .then(loadBrandKits)
                        .catch(() => toast.error('Failed to delete brand kit.'))
                    }
                    className='inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-subtle text-secondary-token'
                    aria-label='Delete brand kit'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </SettingsPanel>
  );
}
