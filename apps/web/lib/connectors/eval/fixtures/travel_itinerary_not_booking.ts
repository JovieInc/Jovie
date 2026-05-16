/**
 * Fixture: flight itinerary for travel to a show.
 * Ground truth: should NOT suggest a calendar event for the flight.
 * (Travel bookings are NOT show bookings.)
 */
export const fixture = {
  id: 'travel_itinerary_not_booking',
  label: 'should_not_suggest' as const,
  email: {
    subject:
      'Your British Airways booking confirmation – LHR → JFK – July 10 2026',
    from: 'noreply@britishairways.com',
    date: '2026-06-20T08:00:00Z',
    body: `Booking reference: BA123456

British Airways

Flight: BA 113
Route: London Heathrow (LHR) → New York JFK
Date: Friday, July 10, 2026
Departure: 11:00 AM BST
Arrival: 2:15 PM EDT (same day)

Passenger: Tim White
Class: Business

Thank you for booking with British Airways.`,
  },
  expectedEvent: null,
  note: 'Travel itinerary — extractor must not confuse flights with show bookings',
};
