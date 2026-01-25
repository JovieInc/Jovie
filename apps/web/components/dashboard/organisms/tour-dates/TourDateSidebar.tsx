'use client';

import { Button, Input, Label } from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TourDateViewModel } from '@/app/app/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import {
  useDeleteTourDateMutation,
  useUpdateTourDateMutation,
} from '@/lib/queries/useTourDateMutations';
import { cn } from '@/lib/utils';
import { formatISODate } from '@/lib/utils/date-formatting';

interface TourDateSidebarProps {
  tourDate: TourDateViewModel | null;
  profileId: string;
  onClose: () => void;
}

type TicketStatus = 'available' | 'sold_out' | 'cancelled';

export function TourDateSidebar({
  tourDate,
  profileId,
  onClose,
}: TourDateSidebarProps) {
  const [formData, setFormData] = useState({
    title: '',
    startDate: '',
    startTime: '',
    venueName: '',
    city: '',
    region: '',
    country: '',
    ticketUrl: '',
    ticketStatus: 'available' as TicketStatus,
  });

  const updateMutation = useUpdateTourDateMutation(profileId);
  const deleteMutation = useDeleteTourDateMutation(profileId);

  useEffect(() => {
    if (tourDate) {
      setFormData({
        title: tourDate.title ?? '',
        startDate: formatISODate(tourDate.startDate),
        startTime: tourDate.startTime ?? '',
        venueName: tourDate.venueName,
        city: tourDate.city,
        region: tourDate.region ?? '',
        country: tourDate.country,
        ticketUrl: tourDate.ticketUrl ?? '',
        ticketStatus: tourDate.ticketStatus,
      });
    }
  }, [tourDate]);

  const handleSave = useCallback(async () => {
    if (!tourDate) return;

    try {
      await updateMutation.mutateAsync({
        id: tourDate.id,
        title: formData.title || null,
        startDate: new Date(formData.startDate).toISOString(),
        startTime: formData.startTime || null,
        venueName: formData.venueName,
        city: formData.city,
        region: formData.region || null,
        country: formData.country,
        ticketUrl: formData.ticketUrl || null,
        ticketStatus: formData.ticketStatus,
      });
      toast.success('Tour date updated');
      onClose();
    } catch {
      toast.error('Failed to update tour date');
    }
  }, [tourDate, formData, updateMutation, onClose]);

  const handleDelete = useCallback(async () => {
    if (!tourDate) return;

    if (!confirm('Are you sure you want to delete this tour date?')) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(tourDate.id);
      toast.success('Tour date deleted');
      onClose();
    } catch {
      toast.error('Failed to delete tour date');
    }
  }, [tourDate, deleteMutation, onClose]);

  if (!tourDate) {
    return null;
  }

  const isPending = updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className='flex h-full flex-col border-l border-subtle bg-surface-1'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-subtle px-4 py-3'>
        <h2 className='text-sm font-semibold text-primary-token'>
          Edit Tour Date
        </h2>
        <button
          type='button'
          onClick={onClose}
          className='rounded p-1 text-tertiary-token hover:bg-surface-2 hover:text-secondary-token'
        >
          <Icon name='X' className='h-4 w-4' />
        </button>
      </div>

      {/* Form */}
      <div className='flex-1 overflow-y-auto p-4'>
        <div className='space-y-4'>
          {/* Source indicator */}
          {tourDate.provider === 'bandsintown' && (
            <div className='flex items-center gap-2 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-700 dark:bg-teal-900/20 dark:text-teal-400'>
              <Icon name='Link' className='h-4 w-4' />
              <span>Synced from Bandsintown</span>
            </div>
          )}

          {/* Title */}
          <div className='space-y-1.5'>
            <Label htmlFor='title'>Event Title (optional)</Label>
            <Input
              id='title'
              type='text'
              placeholder='e.g., Summer Tour 2025'
              value={formData.title}
              onChange={e =>
                setFormData(prev => ({ ...prev, title: e.target.value }))
              }
              disabled={isPending}
            />
          </div>

          {/* Date and Time */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='startDate'>Date</Label>
              <Input
                id='startDate'
                type='date'
                value={formData.startDate}
                onChange={e =>
                  setFormData(prev => ({ ...prev, startDate: e.target.value }))
                }
                disabled={isPending}
                required
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='startTime'>Time</Label>
              <Input
                id='startTime'
                type='text'
                placeholder='8:00 PM'
                value={formData.startTime}
                onChange={e =>
                  setFormData(prev => ({ ...prev, startTime: e.target.value }))
                }
                disabled={isPending}
              />
            </div>
          </div>

          {/* Venue */}
          <div className='space-y-1.5'>
            <Label htmlFor='venueName'>Venue</Label>
            <Input
              id='venueName'
              type='text'
              placeholder='Venue name'
              value={formData.venueName}
              onChange={e =>
                setFormData(prev => ({ ...prev, venueName: e.target.value }))
              }
              disabled={isPending}
              required
            />
          </div>

          {/* Location */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='city'>City</Label>
              <Input
                id='city'
                type='text'
                placeholder='City'
                value={formData.city}
                onChange={e =>
                  setFormData(prev => ({ ...prev, city: e.target.value }))
                }
                disabled={isPending}
                required
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='region'>State/Region</Label>
              <Input
                id='region'
                type='text'
                placeholder='CA'
                value={formData.region}
                onChange={e =>
                  setFormData(prev => ({ ...prev, region: e.target.value }))
                }
                disabled={isPending}
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='country'>Country</Label>
            <Input
              id='country'
              type='text'
              placeholder='USA'
              value={formData.country}
              onChange={e =>
                setFormData(prev => ({ ...prev, country: e.target.value }))
              }
              disabled={isPending}
              required
            />
          </div>

          {/* Ticket URL */}
          <div className='space-y-1.5'>
            <Label htmlFor='ticketUrl'>Ticket URL</Label>
            <Input
              id='ticketUrl'
              type='url'
              placeholder='https://...'
              value={formData.ticketUrl}
              onChange={e =>
                setFormData(prev => ({ ...prev, ticketUrl: e.target.value }))
              }
              disabled={isPending}
            />
          </div>

          {/* Status */}
          <div className='space-y-1.5'>
            <Label>Status</Label>
            <div className='flex gap-2'>
              {(['available', 'sold_out', 'cancelled'] as const).map(status => (
                <button
                  key={status}
                  type='button'
                  onClick={() =>
                    setFormData(prev => ({ ...prev, ticketStatus: status }))
                  }
                  disabled={isPending}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    formData.ticketStatus === status
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-subtle bg-surface-1 text-secondary-token hover:bg-surface-2'
                  )}
                >
                  {status === 'available' && 'On Sale'}
                  {status === 'sold_out' && 'Sold Out'}
                  {status === 'cancelled' && 'Cancelled'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className='border-t border-subtle p-4'>
        <div className='flex items-center gap-2'>
          <Button
            onClick={handleSave}
            disabled={
              isPending ||
              !formData.startDate ||
              !formData.venueName ||
              !formData.city ||
              !formData.country
            }
            className='flex-1'
          >
            {updateMutation.isPending ? (
              <>
                <Icon
                  name='Loader2'
                  className='mr-2 h-4 w-4 animate-spin'
                  aria-hidden='true'
                />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          <Button
            variant='ghost'
            onClick={handleDelete}
            disabled={isPending}
            className='text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20'
          >
            <Icon name='Trash2' className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  );
}
