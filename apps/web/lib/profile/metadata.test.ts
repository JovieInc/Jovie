import { describe, expect, it } from 'vitest';
import {
  buildProfileCanonicalUrl,
  buildProfileDescription,
  buildPublicProfileMetadata,
  PROFILE_ERROR_METADATA,
  PROFILE_NOT_FOUND_METADATA,
  REDIRECT_SINK_METADATA,
  sanitizeMetadataText,
  truncateMetadataText,
} from './metadata';

// ---------------------------------------------------------------------------
// sanitizeMetadataText
// ---------------------------------------------------------------------------

describe('sanitizeMetadataText', () => {
  it('returns empty string for null', () => {
    expect(sanitizeMetadataText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeMetadataText(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitizeMetadataText('')).toBe('');
  });

  it('strips HTML tags', () => {
    expect(sanitizeMetadataText('<b>Hello</b>')).toBe('Hello');
  });

  it('strips unterminated tags without regex backtracking', () => {
    expect(sanitizeMetadataText('Hello <img src=x'.repeat(100))).toBe('Hello');
  });

  it('strips nested HTML tags', () => {
    expect(sanitizeMetadataText('<p>Hello <em>world</em></p>')).toBe(
      'Hello world'
    );
  });

  it('collapses multiple whitespace', () => {
    expect(sanitizeMetadataText('Hello   world')).toBe('Hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeMetadataText('  Hello  ')).toBe('Hello');
  });

  it('strips script tags (leaving inner text content)', () => {
    // The sanitizer removes HTML tags but not the text content between them.
    // Next.js escapes string values when emitting <meta> tags, so the remaining
    // text poses no DOM injection risk. The goal is to prevent tag-level injection.
    const result = sanitizeMetadataText('<script>alert("xss")</script>My Bio');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).toContain('My Bio');
  });

  it('handles img onerror injection', () => {
    expect(sanitizeMetadataText('<img src=x onerror=alert(1)>Bio text')).toBe(
      'Bio text'
    );
  });

  it('returns plain text unchanged (modulo trim)', () => {
    expect(sanitizeMetadataText('Taylor Swift')).toBe('Taylor Swift');
  });
});

// ---------------------------------------------------------------------------
// truncateMetadataText
// ---------------------------------------------------------------------------

describe('truncateMetadataText', () => {
  it('returns text unchanged when within limit', () => {
    expect(truncateMetadataText('Hello', 10)).toBe('Hello');
  });

  it('truncates at word boundary and appends ellipsis', () => {
    const text = 'Hello beautiful world';
    const result = truncateMetadataText(text, 12);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(13); // 12 chars + '…'
  });

  it('truncates exact length', () => {
    const text = 'abcde';
    expect(truncateMetadataText(text, 5)).toBe('abcde');
  });

  it('handles text without spaces (hard truncate)', () => {
    const text = 'abcdefghij';
    const result = truncateMetadataText(text, 5);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildProfileCanonicalUrl
// ---------------------------------------------------------------------------

describe('buildProfileCanonicalUrl', () => {
  it('uses username_normalized when available', () => {
    const url = buildProfileCanonicalUrl({
      username: 'MyArtist',
      username_normalized: 'myartist',
    });
    expect(url).toMatch(/\/myartist$/);
  });

  it('falls back to lowercased username when normalized is null', () => {
    const url = buildProfileCanonicalUrl({
      username: 'MyArtist',
      username_normalized: null,
    });
    expect(url).toMatch(/\/myartist$/);
  });

  it('falls back to lowercased username when normalized is undefined', () => {
    const url = buildProfileCanonicalUrl({
      username: 'MyArtist',
    });
    expect(url).toMatch(/\/myartist$/);
  });

  it('does not double-slash BASE_URL', () => {
    const url = buildProfileCanonicalUrl({
      username: 'artist',
      username_normalized: 'artist',
    });
    expect(url).not.toContain('//artist');
  });
});

// ---------------------------------------------------------------------------
// buildProfileDescription
// ---------------------------------------------------------------------------

describe('buildProfileDescription', () => {
  it('uses bio snippet when bio is present', () => {
    const desc = buildProfileDescription(
      'Drake',
      'Hip-hop artist from Toronto.',
      null,
      null
    );
    expect(desc).toContain('Hip-hop artist from Toronto');
    expect(desc).toContain('Stream on Spotify');
  });

  it('appends genre suffix when bio + genres present', () => {
    const desc = buildProfileDescription('Drake', 'Hip-hop artist.', null, [
      'Hip-Hop',
      'Rap',
    ]);
    expect(desc).toContain('Hip-Hop');
    expect(desc).toContain('Rap');
  });

  it('uses location + genre descriptor when no bio', () => {
    const desc = buildProfileDescription('Artist', null, 'Toronto', ['Pop']);
    expect(desc).toContain('Toronto');
    expect(desc).toContain('Pop');
  });

  it('falls back to plain streaming CTA when no bio, location, or genres', () => {
    const desc = buildProfileDescription('Artist', null, null, null);
    expect(desc).toContain("Stream Artist's music");
    expect(desc).toContain('Jovie');
  });

  it('strips HTML from bio', () => {
    const desc = buildProfileDescription(
      'Artist',
      '<b>Bold bio</b>',
      null,
      null
    );
    expect(desc).not.toContain('<b>');
    expect(desc).toContain('Bold bio');
  });

  it('truncates long bio to 155 chars before appending suffix', () => {
    const longBio = 'A'.repeat(300);
    const desc = buildProfileDescription('Artist', longBio, null, null);
    // The bio snippet should be truncated (contains ellipsis character)
    expect(desc).toContain('…');
  });

  it('handles empty string bio as no-bio fallback', () => {
    const desc = buildProfileDescription('Artist', '', null, null);
    expect(desc).toContain("Stream Artist's music");
  });

  it('filters out empty-after-sanitize genre strings', () => {
    // Genre strings that reduce to empty after sanitization must not produce
    // awkward fragments like ". ,  artist" in the description.
    const desc = buildProfileDescription('Artist', 'Bio text.', null, [
      '<script>evil</script>',
      'Pop',
    ]);
    expect(desc).toContain('Pop');
    expect(desc).not.toContain('<script>');
    // The evil genre sanitizes to '' and must be excluded from the suffix
    expect(desc).not.toMatch(/\.\s+,/);
  });
});

// ---------------------------------------------------------------------------
// buildPublicProfileMetadata — happy path
// ---------------------------------------------------------------------------

describe('buildPublicProfileMetadata', () => {
  const minimalProfile = {
    username: 'myartist',
    username_normalized: 'myartist',
    display_name: null,
    bio: null,
    location: null,
    avatar_url: null,
    is_verified: false,
  };

  it('returns Metadata with title equal to username when display_name is null', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: null,
    });
    expect(meta.title).toBe('myartist');
  });

  it('uses display_name as title when present', () => {
    const meta = buildPublicProfileMetadata({
      profile: { ...minimalProfile, display_name: 'My Artist Name' },
      genres: null,
    });
    expect(meta.title).toBe('My Artist Name');
  });

  it('sanitizes display_name with HTML tags', () => {
    const meta = buildPublicProfileMetadata({
      profile: {
        ...minimalProfile,
        display_name: '<script>evil</script>Artist',
      },
      genres: null,
    });
    expect(String(meta.title)).not.toContain('<script>');
    expect(String(meta.title)).toContain('Artist');
  });

  it('sanitizes username fallback independently when display_name is null', () => {
    // username is also artist-provided; it must be sanitized when used as the
    // fallback title, not passed through raw.
    const meta = buildPublicProfileMetadata({
      profile: {
        ...minimalProfile,
        username: '<b>myartist</b>',
        username_normalized: 'myartist',
        display_name: null,
      },
      genres: null,
    });
    expect(String(meta.title)).not.toContain('<b>');
    expect(String(meta.title)).toContain('myartist');
  });

  it('sets alternates.canonical to the normalized profile URL', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: null,
    });
    expect(meta.alternates?.canonical).toContain('/myartist');
  });

  it('includes openGraph title and description', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: null,
    });
    expect(meta.openGraph?.title).toBeDefined();
    expect(meta.openGraph?.description).toBeDefined();
  });

  it('includes twitter card with summary_large_image', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: null,
    });
    // twitter is typed as a discriminated union in Next.js; access via cast
    const twitter = meta.twitter as Record<string, unknown> | undefined;
    expect(twitter?.card).toBe('summary_large_image');
  });

  it('sets robots.index = true for a published profile', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: null,
    });
    const robots = meta.robots as Record<string, unknown>;
    expect(robots?.index).toBe(true);
  });

  it('includes genre keywords in keywords array', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: ['Electronic', 'House'],
    });
    const keywords = meta.keywords as string[];
    expect(keywords).toContain('Electronic');
    expect(keywords).toContain('House');
  });

  it('includes profile:verified in other when is_verified is true', () => {
    const meta = buildPublicProfileMetadata({
      profile: { ...minimalProfile, is_verified: true },
      genres: null,
    });
    expect((meta.other as Record<string, string>)?.['profile:verified']).toBe(
      'true'
    );
  });

  it('does not include profile:verified when is_verified is false', () => {
    const meta = buildPublicProfileMetadata({
      profile: minimalProfile,
      genres: null,
    });
    expect(
      (meta.other as Record<string, string>)?.['profile:verified']
    ).toBeUndefined();
  });

  it('sanitizes location before embedding in geo.placename', () => {
    const meta = buildPublicProfileMetadata({
      profile: { ...minimalProfile, location: '<b>New York</b>' },
      genres: null,
    });
    const other = meta.other as Record<string, string>;
    expect(other?.['geo.placename']).toBe('New York');
    expect(other?.['geo.placename']).not.toContain('<b>');
  });
});

// ---------------------------------------------------------------------------
// Static fallback metadata objects
// ---------------------------------------------------------------------------

describe('PROFILE_NOT_FOUND_METADATA', () => {
  it('has a title', () => {
    expect(PROFILE_NOT_FOUND_METADATA.title).toBeDefined();
  });

  it('marks robots noindex', () => {
    const robots = PROFILE_NOT_FOUND_METADATA.robots as Record<string, unknown>;
    expect(robots?.index).toBe(false);
  });
});

describe('PROFILE_ERROR_METADATA', () => {
  it('has a title', () => {
    expect(PROFILE_ERROR_METADATA.title).toBeDefined();
  });

  it('marks robots noindex', () => {
    const robots = PROFILE_ERROR_METADATA.robots as Record<string, unknown>;
    expect(robots?.index).toBe(false);
  });

  it('does not leak internal error detail in description', () => {
    expect(String(PROFILE_ERROR_METADATA.description)).not.toMatch(
      /stack|error|exception/i
    );
  });
});

describe('REDIRECT_SINK_METADATA', () => {
  it('marks robots noindex', () => {
    const robots = REDIRECT_SINK_METADATA.robots as Record<string, unknown>;
    expect(robots?.index).toBe(false);
  });

  it('marks robots nofollow', () => {
    const robots = REDIRECT_SINK_METADATA.robots as Record<string, unknown>;
    expect(robots?.follow).toBe(false);
  });
});
