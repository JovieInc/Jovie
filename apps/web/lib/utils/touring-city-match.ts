import type { AudienceMember } from '@/types';

export interface TouringCityInfo {
  city: string;
  showDate: string;
}

export interface TourDateForMatching {
  city: string;
  startDate: string;
}

function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

export function buildTouringCityMap(
  tourDates: TourDateForMatching[]
): Map<string, TouringCityInfo> {
  const now = Date.now();
  const cityMap = new Map<string, TouringCityInfo>();

  for (const td of tourDates) {
    if (new Date(td.startDate).getTime() < now) continue;
    const key = normalizeCity(td.city);
    const existing = cityMap.get(key);
    if (
      !existing ||
      new Date(td.startDate).getTime() < new Date(existing.showDate).getTime()
    ) {
      cityMap.set(key, { city: td.city, showDate: td.startDate });
    }
  }

  return cityMap;
}

export function matchTouringCity(
  member: Pick<AudienceMember, 'geoCity'>,
  cityMap: Map<string, TouringCityInfo>
): TouringCityInfo | null {
  if (!member.geoCity) return null;
  const key = normalizeCity(member.geoCity);
  return cityMap.get(key) ?? null;
}
