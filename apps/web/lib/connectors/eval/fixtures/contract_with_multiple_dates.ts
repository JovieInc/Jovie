/**
 * Fixture: contract email with MULTIPLE show dates.
 * Ground truth: should suggest ALL missing dates as separate events.
 */
export const fixture = {
  id: 'contract_with_multiple_dates',
  label: 'should_suggest' as const,
  email: {
    subject: 'Residency Contract: Berghain 2026 Summer Residency',
    from: 'bookings@berghain.de',
    date: '2026-03-10T12:00:00Z',
    body: `Dear Tim,

Please find the contract for your 2026 summer residency at Berghain attached.

Dates:
- June 6–7, 2026 (Saturday night – Sunday morning): 4:00 AM – 8:00 AM
- July 11–12, 2026 (Saturday night – Sunday morning): 4:00 AM – 8:00 AM
- August 8–9, 2026 (Saturday night – Sunday morning): 4:00 AM – 8:00 AM

Venue: Berghain, Am Wriezener Bahnhof, 10243 Berlin

Fee per date: €6,000

Please sign and return both copies.

Kind regards,
Berghain Booking`,
  },
  existingCalendarEvents: [],
  expectedEvents: [
    {
      title: 'Berghain Berlin',
      startsAt: '2026-06-07T04:00:00',
      city: 'Berlin',
      country: 'DE',
    },
    {
      title: 'Berghain Berlin',
      startsAt: '2026-07-12T04:00:00',
      city: 'Berlin',
      country: 'DE',
    },
    {
      title: 'Berghain Berlin',
      startsAt: '2026-08-09T04:00:00',
      city: 'Berlin',
      country: 'DE',
    },
  ],
};
