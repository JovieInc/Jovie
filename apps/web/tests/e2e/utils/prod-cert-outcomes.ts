import { type APIRequestContext, expect } from '@playwright/test';

/**
 * Outcome checks for the production cert (JOV-14474): each performs a core
 * artist action as the signed-in canary, reads the real result back, and
 * restores what it changed so runs stay idempotent. Registered in
 * docs/product/outcome-coverage.json by their cert step ids.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface OwnedProfile {
  readonly id: string;
  readonly bio: string;
}

export async function readOwnedProfile(
  request: APIRequestContext,
  origin: string
): Promise<OwnedProfile> {
  const response = await request.get(`${origin}/api/dashboard/profile`);
  expect(response.status()).toBe(200);
  const { profile } = (await response.json()) as {
    profile?: { id?: unknown; bio?: string | null };
  };
  // The save routes require the claimed profile's canonical UUID; a bare
  // field payload is rejected with 400 before any write.
  const id = typeof profile?.id === 'string' ? profile.id : '';
  expect(id, 'Profile edit save requires the claimed profile id').toMatch(UUID);
  return { id, bio: typeof profile?.bio === 'string' ? profile.bio : '' };
}

/**
 * JOV-9625: edit the bio, read it back on the public profile, restore.
 *
 * The save path invalidates the public profile's ISR + edge caches, but that
 * is eventually consistent across the CDN: a single immediate sample raced
 * propagation in runs 41155363486 and 41157880251, so poll a bounded window.
 */
export async function saveBioAndReadBack(options: {
  request: APIRequestContext;
  origin: string;
  username: string;
  marker: string;
  wait: (ms: number) => Promise<void>;
}): Promise<string> {
  const { request, origin, username, marker, wait } = options;
  const { id: profileId, bio: originalBio } = await readOwnedProfile(
    request,
    origin
  );
  const save = await request.put(`${origin}/api/dashboard/profile`, {
    data: { profileId, updates: { bio: marker } },
  });
  expect(save.status(), 'Profile edit save failed').toBe(200);
  try {
    const deadline = Date.now() + 30_000;
    let publicText = '';
    for (;;) {
      const publicPage = await request.get(`${origin}/${username}`);
      expect(
        publicPage.status(),
        `Public profile /${username} must render after the save`
      ).toBe(200);
      publicText = await publicPage.text();
      if (publicText.includes(marker) || Date.now() >= deadline) break;
      await wait(1_000);
    }
    expect(
      publicText,
      'Saved bio must read back on the public profile'
    ).toContain(marker);
    return marker;
  } finally {
    // Restore even on a failed readback so the canary keeps no marker.
    const restore = await request.put(`${origin}/api/dashboard/profile`, {
      data: { profileId, updates: { bio: originalBio } },
    });
    expect(restore.status(), 'Profile edit restore failed').toBe(200);
  }
}

interface StoredLink {
  readonly platform: string;
  readonly platformType?: string;
  readonly url: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  readonly displayText?: string | null;
  readonly state?: 'active' | 'suggested' | 'rejected';
  readonly sourceType?: 'manual' | 'admin' | 'ingested';
}

async function readLinks(
  request: APIRequestContext,
  origin: string,
  profileId: string
): Promise<StoredLink[]> {
  const response = await request.get(
    `${origin}/api/dashboard/social-links?profileId=${encodeURIComponent(profileId)}`
  );
  expect(response.status(), 'Links read failed').toBe(200);
  const { links } = (await response.json()) as { links?: StoredLink[] };
  return Array.isArray(links) ? links : [];
}

/** The PUT body for a link set; ingested links are kept by the route itself. */
function toLinkInput(link: StoredLink, sortOrder: number) {
  return {
    platform: link.platform,
    ...(link.platformType ? { platformType: link.platformType } : {}),
    url: link.url,
    sortOrder,
    isActive: link.isActive ?? true,
    ...(link.displayText ? { displayText: link.displayText } : {}),
    ...(link.state ? { state: link.state } : {}),
    sourceType: link.sourceType ?? 'manual',
  };
}

const MARKER_PREFIX = 'https://example.com/jovie-prodcert-';

/**
 * Add a link, read the stored row back, remove it, and read back that it is
 * gone. PUT replaces the profile's non-ingested links, so the canary's own
 * links are sent back with the marker and restored afterwards. The marker is
 * an example.com page: it carries no image, so link enrichment can't change
 * the canary's avatar.
 */
export async function saveLinkAndReadBack(options: {
  request: APIRequestContext;
  origin: string;
  tag: string;
}): Promise<string> {
  const { request, origin, tag } = options;
  const { id: profileId } = await readOwnedProfile(request, origin);
  // A marker left by a run whose restore failed is dropped here, so the next
  // run heals the canary instead of keeping it as one of its own links.
  const own = (await readLinks(request, origin, profileId)).filter(
    link =>
      (link.sourceType ?? 'manual') !== 'ingested' &&
      !link.url.startsWith(MARKER_PREFIX)
  );
  const marker = `${MARKER_PREFIX}${tag}`;
  const put = (links: ReturnType<typeof toLinkInput>[]) =>
    request.put(`${origin}/api/dashboard/social-links`, {
      data: { profileId, links },
    });
  const ownInput = own.map((link, index) => toLinkInput(link, index));
  const add = await put([
    ...ownInput,
    toLinkInput(
      { platform: 'website', url: marker, sourceType: 'manual' },
      ownInput.length
    ),
  ]);
  expect(add.status(), 'Link add failed').toBe(200);
  let restored = false;
  try {
    const added = (await readLinks(request, origin, profileId)).find(
      link => link.url === marker
    );
    expect(added, 'Added link must read back as a stored link').toBeTruthy();
    expect(added?.state ?? 'active', 'Added link must be live').toBe('active');
    const remove = await put(ownInput);
    expect(remove.status(), 'Link remove failed').toBe(200);
    restored = true;
    const after = await readLinks(request, origin, profileId);
    expect(
      after.some(link => link.url === marker),
      'Removed link must be gone'
    ).toBe(false);
    expect(
      after.filter(
        link =>
          (link.sourceType ?? 'manual') !== 'ingested' &&
          !link.url.startsWith(MARKER_PREFIX)
      ).length,
      "The canary's own links must be back"
    ).toBe(own.length);
    return marker;
  } finally {
    if (!restored) {
      const restore = await put(ownInput);
      expect(restore.status(), 'Link restore failed').toBe(200);
    }
  }
}
