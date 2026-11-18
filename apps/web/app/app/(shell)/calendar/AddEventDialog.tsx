'use client';

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  NativeSelect,
} from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { toast } from '@/components/feedback';
import {
  IN_PERSON_EVENT_LABELS,
  IN_PERSON_EVENT_TYPES,
} from '@/lib/events/manual-event-types';
import { queryKeys } from '@/lib/queries/keys';
import type { createManualEvent } from './create-manual-event';

const fields = [
  { name: 'title', label: 'Event Name', maxLength: 200 },
  { name: 'localStart', label: 'Venue Date And Time', type: 'datetime-local' },
  { name: 'timezone', label: 'Venue Timezone', maxLength: 100 },
  { name: 'venueName', label: 'Venue Name', maxLength: 160 },
  { name: 'city', label: 'City', maxLength: 100 },
  { name: 'region', label: 'State Or Region (Optional)', maxLength: 100 },
  { name: 'country', label: 'Country', maxLength: 100 },
  {
    name: 'ticketUrl',
    label: 'Ticket Link (Optional)',
    type: 'url',
    maxLength: 2048,
  },
] as const;

const timezones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
const eventTypeOptions = IN_PERSON_EVENT_TYPES.map(value => ({
  value,
  label: IN_PERSON_EVENT_LABELS[value],
}));
const saveError = 'Could not add the event. Try again.';

export function AddEventDialog({
  profileId,
  createEventAction,
}: {
  readonly profileId: string;
  readonly createEventAction: typeof createManualEvent;
}) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setError(null);
    setOpen(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const input = Object.fromEntries(formData);
    setError(null);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createManualEvent>>;
      try {
        result = await createEventAction(profileId, input);
      } catch {
        setError(saveError);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      toast.success('Event added');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.events.list(profileId),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tourDates.list(profileId),
        exact: true,
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type='button' variant='secondary' size='sm'>
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent hideClose={isPending}>
        <DialogHeader>
          <DialogTitle>Add Event</DialogTitle>
          <DialogDescription>
            Add an in-person event to your private calendar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} aria-busy={isPending}>
          <fieldset
            disabled={isPending}
            className='grid grid-cols-1 gap-3 sm:grid-cols-2'
          >
            <div className='min-w-0 space-y-1'>
              <Label htmlFor={`${formId}-eventType`}>Event Type</Label>
              <NativeSelect
                id={`${formId}-eventType`}
                name='eventType'
                placeholder='Choose an event type'
                options={eventTypeOptions}
                required
              />
            </div>
            {fields.map(field => (
              <div className='min-w-0 space-y-1' key={field.name}>
                <Label htmlFor={`${formId}-${field.name}`}>{field.label}</Label>
                <Input
                  id={`${formId}-${field.name}`}
                  name={field.name}
                  type={'type' in field ? field.type : 'text'}
                  maxLength={'maxLength' in field ? field.maxLength : undefined}
                  required={
                    field.name !== 'region' && field.name !== 'ticketUrl'
                  }
                  list={
                    field.name === 'timezone'
                      ? `${formId}-timezones`
                      : undefined
                  }
                  placeholder={
                    field.name === 'timezone' ? 'America/New_York' : undefined
                  }
                />
              </div>
            ))}
            <datalist id={`${formId}-timezones`}>
              {timezones.map(timezone => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
          </fieldset>
          <p className='min-h-10 py-1 text-sm text-error-text' role='alert'>
            {error}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type='button' variant='secondary' disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type='submit' loading={isPending} disabled={isPending}>
              Save Event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
