/**
 * Deterministic, source-backed fixture for the contacts screen-certification
 * producer. It lets `GET /api/dashboard/contacts` — the registered source
 * for `web.contacts` — respond without a database, so the Product
 * Screenshots workflow can capture exact-head proof against a production
 * build with `DATABASE_URL=postgresql://localhost/noop`.
 *
 * Admission is gated by `isScreenCertAppShellFixtureProfile()`
 * (apps/web/lib/screen-cert/app-shell-fixture-gate.ts) — the exact reserved
 * profile id plus `isRenderFixtureEnabled()`, which fails closed on a real
 * production deployment.
 *
 * Never import this module from a non-fixture code path, and never widen
 * the admission check beyond the exact reserved profile id.
 */
import { SCREEN_CERT_APP_SHELL_PROFILE_ID } from '@/lib/screen-cert/app-shell-fixture-gate';
import type { DashboardContact } from '@/types/contacts';

/**
 * The row this producer selects and captures with the detail sidebar open —
 * see `SCREEN_CERT_CONTACTS_SELECTED_ID` below.
 */
export const SCREEN_CERT_CONTACTS_SELECTED_ID = 'screen-cert-contact-1';
export const SCREEN_CERT_CONTACTS_SELECTED_NAME = 'Priya Anand';

function baseContact(
  overrides: Partial<DashboardContact> &
    Pick<DashboardContact, 'id' | 'role' | 'sortOrder'>
): DashboardContact {
  return {
    creatorProfileId: SCREEN_CERT_APP_SHELL_PROFILE_ID,
    customLabel: null,
    personName: null,
    companyName: null,
    territories: [],
    email: null,
    phone: null,
    preferredChannel: 'email',
    isActive: true,
    ...overrides,
  };
}

export const SCREEN_CERT_CONTACTS_FIXTURE: readonly DashboardContact[] = [
  baseContact({
    id: SCREEN_CERT_CONTACTS_SELECTED_ID,
    role: 'bookings',
    personName: SCREEN_CERT_CONTACTS_SELECTED_NAME,
    companyName: 'Northbound Touring',
    territories: ['US', 'CA'],
    email: 'priya@northboundtouring.example',
    phone: '+1-415-555-0142',
    sortOrder: 0,
  }),
  baseContact({
    id: 'screen-cert-contact-2',
    role: 'management',
    personName: 'Marcus Webb',
    companyName: 'Webb Artist Management',
    territories: ['US'],
    email: 'marcus@webbmanagement.example',
    phone: '+1-212-555-0118',
    sortOrder: 1,
  }),
  baseContact({
    id: 'screen-cert-contact-3',
    role: 'press_pr',
    personName: 'Dana Okafor',
    companyName: 'Reverb & Ink PR',
    territories: ['US', 'UK'],
    email: 'dana@reverbandink.example',
    sortOrder: 2,
  }),
  baseContact({
    id: 'screen-cert-contact-4',
    role: 'brand_partnerships',
    personName: 'Lena Fischer',
    companyName: 'Halo Sponsorship Group',
    territories: ['DE', 'AT', 'CH'],
    email: 'lena@halosponsorship.example',
    preferredChannel: 'phone',
    phone: '+49-30-555-0173',
    sortOrder: 3,
  }),
  baseContact({
    id: 'screen-cert-contact-5',
    role: 'music_collaboration',
    personName: 'Théo Bernard',
    territories: ['FR'],
    email: 'theo.bernard@example.com',
    sortOrder: 4,
  }),
  baseContact({
    id: 'screen-cert-contact-6',
    role: 'fan_general',
    personName: 'Sam Whitfield',
    territories: ['US'],
    email: 'sam.whitfield@example.com',
    isActive: false,
    sortOrder: 5,
  }),
  baseContact({
    id: 'screen-cert-contact-7',
    role: 'bookings',
    personName: 'Aiko Tanaka',
    companyName: 'Tanaka Live Booking',
    territories: ['JP'],
    email: 'aiko@tanakalive.example',
    preferredChannel: 'phone',
    phone: '+81-3-5555-0198',
    sortOrder: 6,
  }),
  baseContact({
    id: 'screen-cert-contact-8',
    role: 'management',
    personName: 'Chris Dunmore',
    companyName: 'Dunmore Creative',
    territories: ['UK'],
    email: 'chris@dunmorecreative.example',
    sortOrder: 7,
  }),
  baseContact({
    id: 'screen-cert-contact-9',
    role: 'other',
    customLabel: 'Merch Fulfillment',
    companyName: 'Loud Print Co',
    territories: ['US'],
    email: 'orders@loudprintco.example',
    sortOrder: 8,
  }),
  baseContact({
    id: 'screen-cert-contact-10',
    role: 'press_pr',
    personName: 'Nadia Costa',
    territories: ['PT', 'ES'],
    email: 'nadia.costa@example.com',
    sortOrder: 9,
  }),
];
