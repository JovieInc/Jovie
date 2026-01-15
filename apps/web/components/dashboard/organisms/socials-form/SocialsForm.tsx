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
import { Input } from '@/components/atoms/Input';
import { FormField } from '@/components/molecules/FormField';
import { EmptyState } from '@/components/organisms/EmptyState';
import type { SocialsFormProps } from './types';
import { useSocialsForm } from './useSocialsForm';

const SOCIALS_FORM_LOADING_KEYS = [
  'socials-form-loading-1',
  'socials-form-loading-2',
  'socials-form-loading-3',
];

export function SocialsForm({ artist }: SocialsFormProps) {
  const {
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
  } = useSocialsForm({ artistId: artist.id });

  if (loading) {
    return (
      <div className='space-y-4'>
        {SOCIALS_FORM_LOADING_KEYS.map(key => (
          <div
            key={key}
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
          onClick={addSocialLink}
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
            onClick: addSocialLink,
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
