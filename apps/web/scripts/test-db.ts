import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, withDb } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';

async function testDbConnection() {
  // Test connection
  console.log('Testing database connection...');
  const result = await db.select().from(users).limit(1);
  console.log('Connection successful! Found users:', result.length);
}

async function createTestUser() {
  console.log('Creating test user...');

  // Generate unique IDs for test data
  const userId = randomUUID();
  const creatorId = randomUUID();
  const linkId = randomUUID();
  const clerkId = `user_${Date.now()}`;
  const username = `testuser-${Date.now()}`;

  const newUser = {
    id: userId,
    clerkId,
    email: `test-${Date.now()}@example.com`,
    isPro: false,
    userStatus: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const newCreator = {
    id: creatorId,
    userId: userId,
    creatorType: 'artist' as const,
    username: username,
    usernameNormalized: username.toLowerCase(),
    displayName: 'Test User',
    bio: 'Test bio',
    isPublic: true,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    profileViews: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const newSocialLink = {
    id: linkId,
    creatorProfileId: creatorId,
    platform: 'Spotify',
    platformType: 'music',
    url: 'https://open.spotify.com/artist/test',
    displayText: 'My Music',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    // Insert user
    const [user] = await db.insert(users).values(newUser).returning();

    // Insert creator profile
    const [creator] = await db
      .insert(creatorProfiles)
      .values(newCreator)
      .returning();

    // Insert social link
    const [link] = await db
      .insert(socialLinks)
      .values(newSocialLink)
      .returning();

    const result = { user, creator, link };
    console.log('Created test data:', result);
    return result;
  } catch (error) {
    console.error('Error creating test data:', error);

    // Clean up any created data if there was an error
    await cleanupPartialTestData(userId, creatorId, linkId);
    return null;
  }
}

async function queryTestUser(userId: string) {
  console.log('Querying test user...');

  const { data, error } = await withDb(async db => {
    return await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      with: {
        creatorProfiles: {
          with: {
            socialLinks: true,
          },
        },
      },
    });
  });

  if (error) {
    console.error('Error querying user:', error);
    return null;
  }

  console.log('Found user with profile and links:', data);
  return data;
}

async function cleanupPartialTestData(
  userId: string,
  creatorId: string,
  linkId: string
) {
  try {
    // Try to clean up in the correct order
    if (linkId) {
      await db.delete(socialLinks).where(eq(socialLinks.id, linkId));
    }

    if (creatorId) {
      await db.delete(creatorProfiles).where(eq(creatorProfiles.id, creatorId));
    }

    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }

    return true;
  } catch (error) {
    console.error('Error during partial cleanup:', error);
    return false;
  }
}

async function cleanupTestData(
  userId: string,
  creatorId: string,
  linkId: string
) {
  console.log('Cleaning up test data...');

  try {
    // Clean up in the correct order to respect foreign key constraints
    if (linkId) {
      await db.delete(socialLinks).where(eq(socialLinks.id, linkId));
    }

    if (creatorId) {
      await db.delete(creatorProfiles).where(eq(creatorProfiles.id, creatorId));
    }

    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }

    console.log('Test data cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    return false;
  }
}

async function runTests() {
  let testData: {
    user: { id: string };
    creator: { id: string };
    link: { id: string };
  } | null = null;

  try {
    // Test connection
    await testDbConnection();

    // Create test data
    testData = await createTestUser();
    if (!testData) {
      throw new Error('Failed to create test data');
    }

    // Query test data
    await queryTestUser(testData.user.id);

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    // Always clean up test data
    if (testData) {
      await cleanupTestData(
        testData.user?.id,
        testData.creator?.id,
        testData.link?.id
      );
    }
  }
}

// Run the tests
runTests();
