import { describe, expect, it } from 'vitest';
import { generateProfileStructuredData } from '@/lib/seo/structured-data';
import type { CreatorProfile } from '@/types/db';

const PROFILE = {
  id: 'profile-123',
  user_id: 'user-456',
  creator_type: 'artist',
  username: 'testartist',
  username_normalized: 'testartist',
  display_name: 'Test Artist',
  bio: 'An amazing artist making great music.',
  is_public: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
} as unknown as CreatorProfile;

function profilePage(data: ReturnType<typeof generateProfileStructuredData>) {
  const graph = data['@graph'] as Record<string, unknown>[];
  return graph.find(node => node['@type'] === 'ProfilePage');
}

describe('ProfilePage About description', () => {
  it('carries the About copy so nothing visible has to duplicate it', () => {
    const data = generateProfileStructuredData(
      PROFILE,
      null,
      [],
      [],
      [],
      [],
      'Test Artist is a producer and DJ based in Los Angeles.'
    );

    expect(profilePage(data)?.description).toBe(
      'Test Artist is a producer and DJ based in Los Angeles.'
    );
  });

  it('omits the description when no About copy is supplied', () => {
    expect(
      profilePage(generateProfileStructuredData(PROFILE, null, []))
    ).not.toHaveProperty('description');
  });
});
