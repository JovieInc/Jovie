import { vi } from 'vitest';
import type { PublicRelease } from '@/components/features/profile/releases/types';
import type { PublicContact } from '@/types/contacts';

export const mockContacts = [
  {
    id: 'contact-1',
    role: 'bookings',
    roleLabel: 'Booking',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    secondaryLabel: 'book@example.com',
    channels: [
      {
        type: 'email' as const,
        encoded: 'book@example.com',
      },
    ],
  },
] satisfies PublicContact[];

export const mockReleases = [
  {
    id: 'release-1',
    title: "Don't Look Down",
    slug: 'dont-look-down',
    releaseType: 'single',
    releaseDate: '2024-11-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/release-1.jpg',
    artistNames: ['Test Artist'],
  },
  {
    id: 'release-2',
    title: 'Holding On',
    slug: 'holding-on',
    releaseType: 'single',
    releaseDate: '2023-10-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/release-2.jpg',
    artistNames: ['Test Artist'],
  },
] satisfies readonly PublicRelease[];

export function mockViewport(width: 'mobile' | 'desktop') {
  const previousMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      width === 'desktop' &&
      (query === '(min-width: 768px)' || query === '(min-width: 1180px)'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;

  return () => {
    window.matchMedia = previousMatchMedia;
  };
}
