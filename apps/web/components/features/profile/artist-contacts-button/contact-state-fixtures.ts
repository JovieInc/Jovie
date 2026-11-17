import { encodeContactPayload } from '@/lib/contacts/obfuscation';
import type { PublicContact } from '@/types/contacts';

/** Contacts with decodable channels, shared by the contact state stories and tests. */
export const BOOKING_CONTACT: PublicContact = {
  id: 'bookings',
  role: 'bookings',
  roleLabel: 'Bookings',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  companyLabel: 'Wasserman Music',
  contactName: 'Jordan Lee',
  channels: [
    {
      type: 'email',
      encoded: encodeContactPayload({
        type: 'email',
        value: 'bookings@example.com',
        subject: 'Booking inquiry',
      }),
    },
  ],
};

export const PRESS_CONTACT: PublicContact = {
  id: 'press',
  role: 'press_pr',
  roleLabel: 'Press',
  territorySummary: 'US & Canada',
  territoryCount: 2,
  territories: ['United States', 'Canada'],
  companyLabel: 'Shore Fire Media',
  channels: [
    {
      type: 'phone',
      encoded: encodeContactPayload({
        type: 'phone',
        value: '+1 (555) 010-2000',
      }),
    },
  ],
};

/** One contact whose every label runs long. */
export const LONG_CONTACT: PublicContact = {
  id: 'management',
  role: 'management',
  roleLabel: 'Management and worldwide touring representation',
  territorySummary: 'Worldwide except North America',
  territoryCount: 4,
  territories: [
    'United Kingdom and Ireland',
    'Continental Europe',
    'Australia and New Zealand',
    'Latin America',
  ],
  companyLabel: 'Silver Arrow Management and Creative Partners International',
  contactName: 'Alexandra Montgomery-Fitzgerald',
  channels: [
    {
      type: 'email',
      encoded: encodeContactPayload({
        type: 'email',
        value: 'management@example.com',
      }),
    },
  ],
};

/** The same booking contact with Arabic labels for right-to-left stories. */
export const RTL_CONTACT: PublicContact = {
  ...BOOKING_CONTACT,
  id: 'bookings-rtl',
  roleLabel: 'الحجوزات',
  territorySummary: 'حول العالم',
  companyLabel: 'وكالة الموسيقى',
  contactName: 'جوردان لي',
};

export const firstChannel = (contact: PublicContact) => contact.channels[0];
