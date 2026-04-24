'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, Input, Label } from '@jovie/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, Globe, MapPin } from 'lucide-react';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Calendar } from '@/components/atoms/Calendar';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
  DrawerCardActionBar,
  DrawerSection,
  DrawerStatGrid,
  DrawerSurfaceCard,
  EntityHeaderCard,
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
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
    return <p className='py-2 text-xs text-tertiary-token'>{emptyMessage}</p>;
  }

  return (
    <ul className='space-y-1'>
      {items.map((item, index) => (
        <li
          key={item.key}
          className='flex h-7 items-center justify-between rounded-md px-1.5'
        >
          <div className='flex min-w-0 flex-1 items-center gap-1.5'>
            <span className='w-3 text-3xs font-caption text-tertiary-token tabular-nums'>
              {index + 1}
            </span>
            <IconComponent className='h-3 w-3 text-tertiary-token' />
            <span className='truncate text-xs text-secondary-token'>
              {item.label}
            </span>
          </div>
          <span className='ml-2 text-xs font-caption text-primary-token tabular-nums'>
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

    const startDate = parseISO(formData.startDate);
    if (Number.isNaN(startDate.getTime())) {
      toast.error('Please choose a valid tour date');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: tourDate.id,
        title: formData.title || null,
        startDate: startDate.toISOString(),
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
  const parsedStartDate = useMemo(() => {
    if (!formData.startDate) return null;
    const parsedDate = parseISO(formData.startDate);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }, [formData.startDate]);

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

  const actionRow = tourDate ? (
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
        className='h-8 flex-1 rounded-full'
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
        className='h-8 rounded-full border border-destructive/15 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive'
      >
        <Icon name='Trash2' className='h-4 w-4' />
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <EntitySidebarShell
        isOpen={Boolean(tourDate)}
        ariaLabel='Edit tour date'
        scrollStrategy='shell'
        onClose={onClose}
        headerMode='minimal'
        hideMinimalHeaderBar
        isEmpty={!tourDate}
        emptyMessage='Select a tour date to edit'
        contextMenuItems={contextMenuItems}
        entityHeader={
          tourDate ? (
            <DrawerSurfaceCard variant='card' className='overflow-hidden p-3.5'>
              <EntityHeaderCard
                eyebrow='Tour Date'
                title={tourDate.title?.trim() || tourDate.venueName}
                subtitle={
                  <>
                    {formatISODate(tourDate.startDate)} · {tourDate.city}
                    {tourDate.region ? `, ${tourDate.region}` : ''} ·{' '}
                    {tourDate.country}
                  </>
                }
                meta={
                  tourDate.provider === 'bandsintown' ? (
                    <div className='flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--color-success)_18%,var(--linear-app-frame-seam))] bg-[color:color-mix(in_oklab,var(--color-success)_10%,transparent)] px-3 py-1.5 text-xs text-[var(--color-success)]'>
                      <Icon name='Link' className='h-3.5 w-3.5' />
                      <span>Synced from Bandsintown</span>
                    </div>
                  ) : null
                }
                footer={actionRow}
                actions={
                  <DrawerCardActionBar
                    primaryActions={[]}
                    menuItems={contextMenuItems}
                    onClose={onClose}
                    overflowTriggerPlacement='card-top-right'
                    overflowTriggerIcon='vertical'
                    className='border-0 bg-transparent px-0 py-0'
                  />
                }
                bodyClassName='pr-9'
              />
            </DrawerSurfaceCard>
          ) : undefined
        }
      >
        {tourDate && (
          <div className='space-y-3'>
            <DrawerSurfaceCard variant='card' className='space-y-3.5 p-3.5'>
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
              <div className='grid grid-cols-2 gap-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor='startDate'>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id='startDate'
                        type='button'
                        variant='outline'
                        disabled={isPending}
                        className={cn(
                          'w-full justify-start gap-2 font-normal',
                          !formData.startDate && 'text-tertiary-token'
                        )}
                      >
                        <CalendarIcon className='h-3.5 w-3.5' />
                        {parsedStartDate
                          ? format(parsedStartDate, 'MMM d, yyyy')
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className='w-auto p-0' align='start'>
                      <Calendar
                        mode='single'
                        selected={parsedStartDate ?? undefined}
                        onSelect={date => {
                          if (!date) return;
                          setFormData(prev => ({
                            ...prev,
                            startDate: format(date, 'yyyy-MM-dd'),
                          }));
                        }}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
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
                    setFormData(prev => ({
                      ...prev,
                      venueName: e.target.value,
                    }))
                  }
                  disabled={isPending}
                  required
                />
              </div>

              {/* Location */}
              <div className='grid grid-cols-2 gap-2'>
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
                    setFormData(prev => ({
                      ...prev,
                      ticketUrl: e.target.value,
                    }))
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
                          'flex-1 rounded-full border px-3 py-2 text-xs font-caption transition-[background-color,border-color,color] duration-150',
                          formData.ticketStatus === status
                            ? 'border-accent/35 bg-accent/10 text-accent'
                            : 'border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token hover:bg-surface-1 hover:text-primary-token'
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
            </DrawerSurfaceCard>

            {/* Analytics */}
            <DrawerSection title='Analytics' surface='card'>
              {analyticsLoading && (
                <DrawerSurfaceCard className='space-y-2 p-3'>
                  <LoadingSkeleton height='h-5' width='w-20' rounded='sm' />
                  <LoadingSkeleton height='h-3' width='w-32' rounded='sm' />
                  <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
                </DrawerSurfaceCard>
              )}
              {!analyticsLoading && analyticsError && (
                <p className='text-xs text-tertiary-token'>
                  Unable to load analytics data.
                </p>
              )}
              {!analyticsLoading && !analyticsError && (
                <div className='space-y-2'>
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
                    <p className='text-xs text-tertiary-token'>
                      No ticket click data yet. Analytics will appear once fans
                      click ticket links for this show.
                    </p>
                  )}
                </div>
              )}
            </DrawerSection>
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
