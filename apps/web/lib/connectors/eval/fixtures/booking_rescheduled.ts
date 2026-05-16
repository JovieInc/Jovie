/**
 * Fixture: rescheduled booking email.
 * Ground truth: should suggest — new date needs to be on the calendar.
 */
export const fixture = {
  id: 'booking_rescheduled',
  label: 'should_suggest' as const,
  email: {
    subject:
      'Rescheduled: Your booking at Shelter Berlin moved to October 3, 2026',
    from: 'bookings@shelter-berlin.com',
    date: '2026-08-15T10:00:00Z',
    body: `Hi Tim,

We need to move your Shelter booking to a new date.

New date: Saturday, October 3 / Sunday, October 4, 2026
Set time: 3:00 AM – 5:00 AM
Venue: Shelter, Köpenicker Str. 70, 10179 Berlin

The original September 5 date is cancelled.

Best,
Shelter Berlin`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Shelter Berlin',
    startsAt: '2026-10-04T03:00:00',
    city: 'Berlin',
    country: 'DE',
  },
  note: 'Reschedule — extractor should suggest the NEW date',
};
