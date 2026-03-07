import 'server-only';

const MANAGEMENT_PREFIXES = [
  'booking@',
  'mgmt@',
  'management@',
  'agent@',
  'press@',
  'publicity@',
];

const BIO_KEYWORDS = [
  'represented by',
  'booking:',
  'management:',
  'for bookings',
];

export interface RepresentationResult {
  hasRepresentation: boolean;
  signal: string | null;
}

export function detectRepresentation(
  email: string | null,
  bio: string | null
): RepresentationResult {
  if (email) {
    const lower = email.toLowerCase();
    for (const prefix of MANAGEMENT_PREFIXES) {
      if (lower.startsWith(prefix)) {
        return { hasRepresentation: true, signal: `Email prefix: ${prefix}` };
      }
    }
  }

  if (bio) {
    const lowerBio = bio.toLowerCase();
    for (const keyword of BIO_KEYWORDS) {
      if (lowerBio.includes(keyword)) {
        return { hasRepresentation: true, signal: `Bio keyword: ${keyword}` };
      }
    }
  }

  return { hasRepresentation: false, signal: null };
}
