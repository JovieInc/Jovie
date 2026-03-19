'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, Input, Label } from '@jovie/ui';
import { Globe, MapPin } from 'lucide-react';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
  DrawerSection,
  DrawerStatGrid,
  DrawerSurfaceCard,
  EntitySidebarShell,
  StatTile,
} from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { convertToCommonDropdownItems } from '@/components/organisms/table';
import {
  useDeleteTourDateMutation,
  useTourDateAnalyticsQuery,
  useUpdateTourDateMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatISODate } from '@/lib/utils/date-formatting';
import { buildTourDateActions } from './tour-date-actions';

const numberFormatter = new Intl.NumberFormat();

interface MiniRankedItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function MiniRankedList({
  icon: IconComponent,
  items,
  emptyMessage,
}: {
  readonly icon: ComponentType<{ className?: string }>;
  readonly items: readonly MiniRankedItem[];
  readonly emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className='py-2 text-[12px] text-tertiary-token'>{emptyMessage}</p>
    );
  }

  return (
    <ul className='space-y-1'>
      {items.map((item, index) => (
        <li
          key={`${item.key}-${index}`}
          className='flex h-7 items-center justify-between rounded-md px-1.5'
        >
          <div className='flex min-w-0 flex-1 items-center gap-1.5'>
            <span className='w-3 text-[10px] font-[510] text-tertiary-token tabular-nums'>
              {index + 1}
            </span>
            <IconComponent className='h-3 w-3 text-tertiary-token' />
            <span className='truncate text-[12px] text-secondary-token'>
              {item.label}
            </span>
          </div>
          <span className='ml-2 text-[12px] font-[510] text-primary-token tabular-nums'>
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface TourDateSidebarProps {
  readonly tourDate: TourDateViewModel | null;
  readonly profileId: string;
  readonly onClose: () => void;
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
    timezone: '',
    ticketUrl: '',
    ticketStatus: 'available' as TicketStatus,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const updateMutation = useUpdateTourDateMutation(profileId);
  const deleteMutation = useDeleteTourDateMutation(profileId);
  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useTourDateAnalyticsQuery({
    tourDateId: tourDate?.id ?? null,
    enabled: Boolean(tourDate),
  });

  useEffect(() => {
    if (tourDate) {
      setFormData({
        title: tourDate.title ?? '',
        startDate: formatISODate(tourDate.startDate),
        startTime: tourDate.startTime ?? '',
        timezone: tourDate.timezone ?? '',
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
        timezone: formData.timezone || null,
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

  const handleDeleteClick = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!tourDate) return;

    try {
      await deleteMutation.mutateAsync(tourDate.id);
      toast.success('Tour date deleted');
      onClose();
    } catch {
      toast.error('Failed to delete tour date');
    }
  }, [tourDate, deleteMutation, onClose]);

  const isPending = updateMutation.isPending || deleteMutation.isPending;

  // Build sidebar overflow menu from canonical tour date actions
  const contextMenuItems = useMemo<CommonDropdownItem[]>(() => {
    if (!tourDate) return [];
    return convertToCommonDropdownItems(
      buildTourDateActions(tourDate, {
        onEdit: () => {
          // Already editing — no-op in sidebar context
        },
        onDelete: () => setDeleteDialogOpen(true),
      })
    );
  }, [tourDate]);

  const footerContent = tourDate ? (
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
        onClick={handleDeleteClick}
        disabled={isPending}
        className='text-destructive hover:bg-destructive/10 hover:text-destructive'
      >
        <Icon name='Trash2' className='h-4 w-4' />
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <EntitySidebarShell
        isOpen={Boolean(tourDate)}
        width={320}
        ariaLabel='Edit tour date'
        title='Edit Tour Date'
        onClose={onClose}
        isEmpty={!tourDate}
        emptyMessage='Select a tour date to edit'
        footer={footerContent}
        contextMenuItems={contextMenuItems}
      >
        {tourDate && (
          <div className='space-y-4'>
            {/* Source indicator */}
            {tourDate.provider === 'bandsintown' && (
              <div className='flex items-center gap-2 rounded-md bg-teal-50 px-3 py-2 text-[13px] text-teal-700 dark:bg-teal-900/20 dark:text-teal-400'>
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

            {/* Date, Time, and Timezone */}
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='startDate'>Date</Label>
                <Input
                  id='startDate'
                  type='date'
                  value={formData.startDate}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
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
                    setFormData(prev => ({
                      ...prev,
                      startTime: e.target.value,
                    }))
                  }
                  disabled={isPending}
                />
              </div>
            </div>

            {/* Timezone */}
            <div className='space-y-1.5'>
              <Label htmlFor='timezone'>Timezone (optional)</Label>
              <Input
                id='timezone'
                type='text'
                placeholder='e.g., America/New_York'
                value={formData.timezone}
                onChange={e =>
                  setFormData(prev => ({ ...prev, timezone: e.target.value }))
                }
                disabled={isPending}
              />
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
                {(['available', 'sold_out', 'cancelled'] as const).map(
                  status => (
                    <button
                      key={status}
                      type='button'
                      onClick={() =>
                        setFormData(prev => ({
                          ...prev,
                          ticketStatus: status,
                        }))
                      }
                      disabled={isPending}
                      className={cn(
                        'flex-1 rounded-md border px-3 py-2 text-[13px] font-[510] transition-colors',
                        formData.ticketStatus === status
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-subtle bg-surface-1 text-secondary-token hover:bg-surface-2'
                      )}
                    >
                      {status === 'available' && 'On Sale'}
                      {status === 'sold_out' && 'Sold Out'}
                      {status === 'cancelled' && 'Cancelled'}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Analytics */}
            <div className='border-t border-subtle pt-4'>
              <DrawerSection title='Analytics'>
                {analyticsLoading && (
                  <DrawerSurfaceCard className='space-y-3 p-3'>
                    <LoadingSkeleton height='h-5' width='w-20' rounded='sm' />
                    <LoadingSkeleton height='h-3' width='w-32' rounded='sm' />
                    <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
                  </DrawerSurfaceCard>
                )}
                {!analyticsLoading && analyticsError && (
                  <p className='text-[12px] text-tertiary-token'>
                    Unable to load analytics data.
                  </p>
                )}
                {!analyticsLoading && !analyticsError && (
                  <div className='space-y-3'>
                    <DrawerStatGrid>
                      <StatTile
                        label='Ticket Clicks'
                        value={numberFormatter.format(
                          analyticsData?.ticketClicks ?? 0
                        )}
                      />
                      <StatTile
                        label='Top Cities'
                        value={String(analyticsData?.topCities?.length ?? 0)}
                      />
                    </DrawerStatGrid>

                    {(analyticsData?.topCities?.length ?? 0) > 0 && (
                      <DrawerSurfaceCard className='p-2'>
                        <MiniRankedList
                          icon={MapPin}
                          items={(analyticsData?.topCities ?? []).map(c => ({
                            key: c.city,
                            label: c.city,
                            value: numberFormatter.format(c.count),
                          }))}
                          emptyMessage='No city data yet'
                        />
                      </DrawerSurfaceCard>
                    )}

                    {(analyticsData?.topReferrers?.length ?? 0) > 0 && (
                      <DrawerSurfaceCard className='p-2'>
                        <MiniRankedList
                          icon={Globe}
                          items={(analyticsData?.topReferrers ?? []).map(r => ({
                            key: r.referrer || 'direct',
                            label: r.referrer || 'Direct',
                            value: numberFormatter.format(r.count),
                          }))}
                          emptyMessage='No referrer data yet'
                        />
                      </DrawerSurfaceCard>
                    )}

                    {(analyticsData?.ticketClicks ?? 0) === 0 && (
                      <p className='text-[12px] text-tertiary-token'>
                        No ticket click data yet. Analytics will appear once
                        fans click ticket links for this show.
                      </p>
                    )}
                  </div>
                )}
              </DrawerSection>
            </div>
          </div>
        )}
      </EntitySidebarShell>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title='Delete tour date?'
        description='This action cannot be undone. The tour date will be permanently removed.'
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={handleDeleteConfirm}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
