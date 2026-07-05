export interface EnrichedProfileData {
  name: string | null;
  imageUrl: string | null;
  bio: string | null;
  genres: string[];
  followers: number | null;
}

export async function enrichProfileFromDsp(): Promise<EnrichedProfileData | null> {
  return null;
}
