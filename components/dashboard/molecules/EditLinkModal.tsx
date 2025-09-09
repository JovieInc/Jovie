'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/atoms/Label';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/Input';

type Platform =
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'spotify'
  | 'applemusic'
  | 'custom';

interface EditLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: {
    id: string;
    title: string;
    url: string;
    platform: Platform;
  } | null;
  onSave: (
    id: string,
    updates: { title: string; url: string; platform: Platform }
  ) => Promise<void>;
}

const platformOptions = [
  { value: 'custom', label: 'Custom Link' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'spotify', label: 'Spotify' },
  { value: 'applemusic', label: 'Apple Music' },
];

export function EditLinkModal({
  isOpen,
  onClose,
  link,
  onSave,
}: EditLinkModalProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<Platform>('custom');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (link) {
      setTitle(link.title);
      setUrl(link.url);
      setPlatform(link.platform);
    }
  }, [link]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link) return;
    try {
      setIsSaving(true);
      await onSave(link.id, { title, url, platform });
      onClose();
      toast.success('Link updated successfully');
    } catch (error) {
      console.error('Error updating link:', error);
      toast.error('Failed to update link. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPlatform = e.target.value as Platform;
    setPlatform(newPlatform);
    if (title === '' || platformOptions.some(p => p.label === title)) {
      const platformLabel =
        platformOptions.find(p => p.value === newPlatform)?.label ||
        'Custom Link';
      setTitle(platformLabel);
    }
  };

  if (!link) return null;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Edit Link</DialogTitle>
          <DialogDescription>Update your link details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='platform'>Platform</Label>
            <select
              id='platform'
              value={platform}
              onChange={handlePlatformChange}
              className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {platformOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='title'>Title</Label>
            <Input
              id='title'
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder='Link title'
              required
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='url'>URL</Label>
            <Input
              id='url'
              type='url'
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder='https://example.com'
              required
            />
          </div>

          <DialogFooter className='flex justify-end space-x-2 pt-4'>
            <Button
              type='button'
              variant='outline'
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
