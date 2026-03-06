import { describe, expect, it } from 'vitest';

import {
  classifyIntent,
  INTENT_PATTERNS,
  IntentCategory,
  isDeterministicIntent,
} from '@/lib/intent-detection';

describe('classifyIntent', () => {
  describe('PROFILE_UPDATE_NAME patterns', () => {
    it.each([
      ['change name to DJ Shadow', 'DJ Shadow'],
      ['update my name to The Weeknd', 'The Weeknd'],
      ['set display name to Aurora', 'Aurora'],
      ['set my displayname to Childish Gambino', 'Childish Gambino'],
      ['change my display name to KAYTRANADA', 'KAYTRANADA'],
      ['edit name to New Name', 'New Name'],
      ['rename my artist name to MC Flow', 'MC Flow'],
    ])('matches "%s" and extracts value "%s"', (input, expectedValue) => {
      const result = classifyIntent(input);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(result!.extractedData.value).toBe(expectedValue);
    });

    it('matches alternative "should be" phrasing', () => {
      const result = classifyIntent('my name should be New Artist');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(result!.extractedData.value).toBe('New Artist');
    });

    it('matches "name is" phrasing', () => {
      const result = classifyIntent('my display name is Cool Name');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(result!.extractedData.value).toBe('Cool Name');
    });

    it('matches with colon separator (space before colon)', () => {
      const result = classifyIntent('set name : My Name');
      expect(result).not.toBeNull();
      expect(result!.extractedData.value).toBe('My Name');
    });

    it('matches with equals separator', () => {
      const result = classifyIntent('set name = My Name');
      expect(result).not.toBeNull();
      expect(result!.extractedData.value).toBe('My Name');
    });

    it('does not match colon directly after field name (no space)', () => {
      const result = classifyIntent('set name:My Name');
      expect(result).toBeNull();
    });

    it('is case insensitive', () => {
      const result = classifyIntent('CHANGE NAME TO New Name');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
    });

    it('trims whitespace from message', () => {
      const result = classifyIntent('  change name to Trimmed   ');
      expect(result).not.toBeNull();
      expect(result!.extractedData.value).toBe('Trimmed');
    });
  });

  describe('PROFILE_UPDATE_BIO patterns', () => {
    it.each([
      ['change bio to A cool new bio', 'A cool new bio'],
      ['update my bio to I make beats', 'I make beats'],
      ['set bio to Electronic music producer', 'Electronic music producer'],
      ['edit bio to New bio text', 'New bio text'],
    ])('matches "%s" and extracts value "%s"', (input, expectedValue) => {
      const result = classifyIntent(input);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_BIO);
      expect(result!.extractedData.value).toBe(expectedValue);
    });

    it('matches "should be" phrasing', () => {
      const result = classifyIntent('my bio should be Producer from LA');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_BIO);
      expect(result!.extractedData.value).toBe('Producer from LA');
    });

    it('matches with colon separator (space before colon)', () => {
      const result = classifyIntent('set bio : New bio text here');
      expect(result).not.toBeNull();
      expect(result!.extractedData.value).toBe('New bio text here');
    });
  });

  describe('LINK_ADD patterns', () => {
    it('matches link addition with URL', () => {
      const result = classifyIntent('add link to https://instagram.com/artist');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_ADD);
      expect(result!.extractedData.url).toBe('https://instagram.com/artist');
    });

    it('matches link addition with platform and URL', () => {
      const result = classifyIntent(
        'add instagram link to https://instagram.com/myhandle'
      );
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_ADD);
      expect(result!.extractedData.url).toBe('https://instagram.com/myhandle');
    });

    it('matches "connect" verb', () => {
      const result = classifyIntent(
        'connect https://open.spotify.com/artist/123'
      );
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_ADD);
    });

    it('matches platform-only link add (no URL)', () => {
      const result = classifyIntent('add instagram');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_ADD);
      expect(result!.extractedData.platform).toBe('instagram');
    });

    it.each([
      'twitter',
      'tiktok',
      'youtube',
      'spotify',
      'soundcloud',
      'bandcamp',
    ])('matches platform name "%s"', platform => {
      const result = classifyIntent(`add my ${platform} link`);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_ADD);
      expect(result!.extractedData.platform).toBe(platform);
    });

    it('matches "set up" verb', () => {
      const result = classifyIntent('set up my instagram');
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_ADD);
    });
  });

  describe('LINK_REMOVE patterns', () => {
    it.each([
      ['remove instagram', 'instagram'],
      ['delete my twitter link', 'twitter'],
      ['disconnect spotify', 'spotify'],
      ['unlink tiktok', 'tiktok'],
    ])('matches "%s" and extracts platform "%s"', (input, expectedPlatform) => {
      const result = classifyIntent(input);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.LINK_REMOVE);
      expect(result!.extractedData.platform).toBe(expectedPlatform);
    });

    it('is case insensitive for platform names', () => {
      const result = classifyIntent('remove Instagram');
      expect(result).not.toBeNull();
      expect(result!.extractedData.platform).toBe('instagram');
    });
  });

  describe('AVATAR_UPLOAD patterns', () => {
    it.each([
      'upload my photo',
      'change my avatar',
      'update profile picture',
      'set my pfp',
      'change my headshot',
      'upload photo',
    ])('matches avatar intent: "%s"', input => {
      const result = classifyIntent(input);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.AVATAR_UPLOAD);
    });
  });

  describe('SETTINGS_TOGGLE patterns', () => {
    it.each([
      ['enable dark mode', 'dark mode'],
      ['disable notifications', 'notifications'],
      ['turn on analytics', 'analytics'],
      ['turn off tips', 'tips'],
      ['toggle tipping', 'tipping'],
    ])('matches "%s" and extracts setting "%s"', (input, expectedSetting) => {
      const result = classifyIntent(input);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(IntentCategory.SETTINGS_TOGGLE);
      expect(result!.extractedData.setting).toBe(expectedSetting);
    });
  });

  describe('non-matching fallthrough', () => {
    it.each([
      ['what is my bio?'],
      ['tell me about my profile'],
      ['how many followers do I have?'],
      ['help me write a press release'],
      ['generate a canvas for my latest single'],
      [''],
      ['hello'],
      ['thanks'],
    ])('returns null for non-CRUD message: "%s"', input => {
      expect(classifyIntent(input)).toBeNull();
    });

    it('returns null for messages exceeding max length', () => {
      const longMessage = 'change name to ' + 'x'.repeat(300);
      expect(classifyIntent(longMessage)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(classifyIntent('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(classifyIntent('   ')).toBeNull();
    });
  });

  describe('confidence and metadata', () => {
    it('always returns confidence 1.0 for deterministic matches', () => {
      const result = classifyIntent('change name to Test');
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(1.0);
    });

    it('preserves rawMessage (trimmed)', () => {
      const result = classifyIntent('  change name to Test  ');
      expect(result).not.toBeNull();
      expect(result!.rawMessage).toBe('change name to Test');
    });
  });

  describe('edge cases', () => {
    it('handles special characters in extracted names', () => {
      const result = classifyIntent('change name to MC $pecial & Char!');
      expect(result).not.toBeNull();
      expect(result!.extractedData.value).toBe('MC $pecial & Char!');
    });

    it('handles URLs with query params in link add', () => {
      const result = classifyIntent(
        'add link to https://example.com/path?foo=bar&baz=1'
      );
      expect(result).not.toBeNull();
      expect(result!.extractedData.url).toBe(
        'https://example.com/path?foo=bar&baz=1'
      );
    });
  });
});

describe('isDeterministicIntent', () => {
  it('returns true for a detected intent', () => {
    const intent = classifyIntent('change name to Test');
    expect(isDeterministicIntent(intent)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isDeterministicIntent(null)).toBe(false);
  });

  it('returns false for AI_REQUIRED category', () => {
    const aiIntent = {
      category: IntentCategory.AI_REQUIRED,
      confidence: 1.0,
      extractedData: {},
      rawMessage: 'some complex request',
    };
    expect(isDeterministicIntent(aiIntent)).toBe(false);
  });
});

describe('INTENT_PATTERNS registry', () => {
  it('is sorted by priority descending', () => {
    for (let i = 1; i < INTENT_PATTERNS.length; i++) {
      expect(INTENT_PATTERNS[i - 1].priority).toBeGreaterThanOrEqual(
        INTENT_PATTERNS[i].priority
      );
    }
  });

  it('all patterns have required fields', () => {
    for (const pattern of INTENT_PATTERNS) {
      expect(pattern.category).toBeDefined();
      expect(pattern.pattern).toBeInstanceOf(RegExp);
      expect(typeof pattern.extract).toBe('function');
      expect(typeof pattern.priority).toBe('number');
    }
  });

  it('all patterns have case insensitive flag', () => {
    for (const pattern of INTENT_PATTERNS) {
      expect(pattern.pattern.flags).toContain('i');
    }
  });

  it('covers expected intent categories', () => {
    const categoriesInPatterns = new Set(INTENT_PATTERNS.map(p => p.category));
    expect(categoriesInPatterns.has(IntentCategory.PROFILE_UPDATE_NAME)).toBe(
      true
    );
    expect(categoriesInPatterns.has(IntentCategory.PROFILE_UPDATE_BIO)).toBe(
      true
    );
    expect(categoriesInPatterns.has(IntentCategory.LINK_ADD)).toBe(true);
    expect(categoriesInPatterns.has(IntentCategory.LINK_REMOVE)).toBe(true);
    expect(categoriesInPatterns.has(IntentCategory.AVATAR_UPLOAD)).toBe(true);
    expect(categoriesInPatterns.has(IntentCategory.SETTINGS_TOGGLE)).toBe(true);
  });

  describe('priority ordering when multiple patterns could match', () => {
    it('profile name patterns have higher priority than link patterns', () => {
      const namePriority = INTENT_PATTERNS.find(
        p => p.category === IntentCategory.PROFILE_UPDATE_NAME
      )!.priority;
      const linkPriority = INTENT_PATTERNS.find(
        p => p.category === IntentCategory.LINK_ADD
      )!.priority;
      expect(namePriority).toBeGreaterThanOrEqual(linkPriority);
    });

    it('link patterns have higher priority than settings toggle', () => {
      const linkPriority = INTENT_PATTERNS.find(
        p => p.category === IntentCategory.LINK_ADD
      )!.priority;
      const settingsPriority = INTENT_PATTERNS.find(
        p => p.category === IntentCategory.SETTINGS_TOGGLE
      )!.priority;
      expect(linkPriority).toBeGreaterThan(settingsPriority);
    });

    it('name pattern matches before bio for "change name" input', () => {
      const result = classifyIntent('change name to Something');
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
    });

    it('bio pattern matches specifically for "change bio" input', () => {
      const result = classifyIntent('change bio to Something');
      expect(result!.category).toBe(IntentCategory.PROFILE_UPDATE_BIO);
    });
  });
});
