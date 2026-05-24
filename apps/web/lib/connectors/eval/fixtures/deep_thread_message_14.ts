/**
 * Fixture: booking confirmation buried in a long email thread (message 14).
 * Ground truth: should suggest — extractor must find the booking even in thread noise.
 */
export const fixture = {
  id: 'deep_thread_message_14',
  label: 'should_suggest' as const,
  email: {
    subject:
      'Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Re: Corsica Studios',
    from: 'mark@corsica-studios.co.uk',
    date: '2026-05-12T17:30:00Z',
    body: `> > > > > > > > > > > > Tim White wrote:
> > > > > > > > > > > >   Works for me, let's do it.
> > > > > > > > > > >
> > > > > > > > > > > Mark wrote:
> > > > > > > > > > >   How about September 26?
> > > > > > > > > > >
> > > > > > > > > > Tim White wrote:
> > > > > > > > > >   Still available on those dates.
> > > > > > > > >
> > > > > > > > > Mark wrote:
> > > > > > > > >   Any update? We need to lock this in.
> > > > > > > > >
> > > > > > > > Tim White wrote:
> > > > > > > >   Sorry, been touring. Checking now.
> > > > > > >
> > > > > > > Mark wrote:
> > > > > > >   Bumping this — what weekends work in late September?
[... 8 more quoted replies ...]

---

Hi Tim,

CONFIRMED BOOKING SUMMARY:

Venue: Corsica Studios, London
Date: Saturday, September 26 / Sunday, September 27, 2026
Set time: 2:00 AM – 5:00 AM
Fee: £2,000

Contract to follow.

Mark
Corsica Studios`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Corsica Studios London',
    startsAt: '2026-09-27T02:00:00',
    city: 'London',
    country: 'GB',
  },
  note: 'Booking is at bottom of deeply nested thread — extractor must look past quoted noise',
};
