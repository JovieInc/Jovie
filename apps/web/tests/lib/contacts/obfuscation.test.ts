import { describe, expect, it } from 'vitest';
import {
  decodeContactPayload,
  encodeContactPayload,
} from '@/lib/contacts/obfuscation';

describe('contact obfuscation helpers', () => {
  it('encodes and decodes payloads symmetrically', () => {
    const encoded = encodeContactPayload({
      type: 'email',
      value: 'agent@example.com',
      subject: 'Booking - Jovie',
      contactId: 'contact-1',
    });

    const decoded = decodeContactPayload(encoded);

    expect(decoded).toEqual({
      type: 'email',
      value: 'agent@example.com',
      subject: 'Booking - Jovie',
      contactId: 'contact-1',
    });
  });

  it('returns null for malformed payloads', () => {
    expect(decodeContactPayload('not-base64')).toBeNull();
  });
});
