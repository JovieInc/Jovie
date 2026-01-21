import type { ContactChannel, DashboardContactInput } from '@/types/contacts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTerritories(raw: string[]): string[] {
  const cleaned = raw.map(value => value.trim()).filter(Boolean);

  const unique = Array.from(new Set(cleaned));
  const hasWorldwide = unique.some(
    value => value.toLowerCase() === 'worldwide'
  );

  if (hasWorldwide) {
    return ['Worldwide'];
  }

  return unique.slice(0, 8);
}

export function validateEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  // Limit input length to prevent ReDoS (RFC 5321 max email length is 254)
  if (trimmed.length > 254) {
    throw new Error('Email address is too long');
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new Error('Please enter a valid email');
  }
  return trimmed.toLowerCase();
}

export function normalizePhone(
  phone: string | null | undefined
): string | null {
  if (!phone) return null;
  const digits = phone.replaceAll(/[^\d+]/g, '');
  const numeric = digits.startsWith('+') ? digits.slice(1) : digits;
  const cleanDigits = numeric.replaceAll(/[^\d]/g, '');

  if (cleanDigits.length === 0) return null;
  if (cleanDigits.length < 7 || cleanDigits.length > 15) {
    throw new Error('Please enter a valid phone number');
  }

  return `+${cleanDigits}`;
}

export function resolvePreferredChannel(
  email: string | null,
  phone: string | null,
  preferred?: ContactChannel | null
): ContactChannel | null {
  if (email && phone) {
    if (preferred === 'email' || preferred === 'phone') {
      return preferred;
    }
    return 'email';
  }

  if (email) return 'email';
  if (phone) return 'phone';
  return null;
}

export function sanitizeContactInput(
  input: DashboardContactInput
): DashboardContactInput {
  if (!input.profileId) {
    throw new Error('Profile ID is required');
  }

  const email = validateEmail(input.email ?? null);
  const phone = normalizePhone(input.phone ?? null);

  if (!email && !phone) {
    throw new Error('Add at least one contact channel (email or phone)');
  }

  const territories = normalizeTerritories(input.territories ?? []);

  const clip = (value: string | null | undefined, max: number) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
  };

  const personName = clip(input.personName, 120);
  const companyName = clip(input.companyName, 160);
  const customLabel = clip(input.customLabel, 80);

  const preferredChannel = resolvePreferredChannel(
    email,
    phone,
    input.preferredChannel
  );

  return {
    ...input,
    email,
    phone,
    preferredChannel,
    personName,
    companyName,
    customLabel,
    territories,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}
