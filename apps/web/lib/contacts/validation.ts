import type { ContactChannel, DashboardContactInput } from '@/types/contacts';
import {
  normalizeEmail,
  normalizePhone as normalizePhoneBase,
} from '@/lib/validation/contact';

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
  return normalizeEmail(email, { throwOnError: true });
}

export function normalizePhone(
  phone: string | null | undefined
): string | null {
  return normalizePhoneBase(phone, { throwOnError: true });
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
