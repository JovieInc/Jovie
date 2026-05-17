/**
 * Fixture: vague subject line but clear booking details in body.
 * Ground truth: should suggest — body has all required info.
 */
export const fixture = {
  id: 'booking_vague_subject_clear_body',
  label: 'should_suggest' as const,
  email: {
    subject: 'Re: Re: Re: Following up',
    from: 'sarah@elrowbookings.com',
    date: '2026-04-05T16:00:00Z',
    body: `Hey Tim,

Great! So to confirm everything in writing:

We've got you locked in for elrow Barcelona:
- Date: Saturday August 15 / Sunday August 16, 2026
- Time: 4:00 AM – 8:00 AM
- Venue: Pacha, Av. del Paral·lel, 64, Barcelona
- Fee: €7,000 + expenses

Let me know if you need anything else.

Sarah
elrow`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'elrow Barcelona',
    startsAt: '2026-08-16T04:00:00',
    city: 'Barcelona',
    country: 'ES',
  },
  note: 'Extractor must read body, not just subject',
};
