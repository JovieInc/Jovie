import { describe, expect, it } from 'vitest';
import { classifyIntent, isDeterministicIntent } from '@/lib/intent-detection';
import { IntentCategory } from '@/lib/intent-detection/types';

describe('classifyIntent', () => {
  describe('profile name updates', () => {
    it.each([
      'change my name to DJ Shadow',
      'update my display name to The Weeknd',
      'set name to Billie',
      'edit my artist name to AURORA',
      'rename my name to Grimes',
    ])('classifies "%s" as PROFILE_UPDATE_NAME', msg => {
      const intent = classifyIntent(msg);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(intent!.extractedData.value).toBeTruthy();
    });

    it('extracts the correct name value', () => {
      const intent = classifyIntent('change my name to DJ Shadow');
      expect(intent!.extractedData.value).toBe('DJ Shadow');
    });

    it('handles "name should be" phrasing', () => {
      const intent = classifyIntent('my name should be Nova');
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(intent!.extractedData.value).toBe('Nova');
    });
  });

  describe('profile bio updates', () => {
    it.each([
      'change my bio to Independent artist from LA',
      'update bio to Making beats since 2020',
      'set my bio to Producer / DJ / Creator',
    ])('classifies "%s" as PROFILE_UPDATE_BIO', msg => {
      const intent = classifyIntent(msg);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_BIO);
      expect(intent!.extractedData.value).toBeTruthy();
    });

    it('preserves multiline bio text', () => {
      const intent = classifyIntent('set my bio to Line one\nLine two');
      expect(intent!.extractedData.value).toContain('Line one');
    });
  });

  describe('link additions', () => {
    it('classifies platform name link adds', () => {
      const intent = classifyIntent('add my instagram');
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.LINK_ADD);
      expect(intent!.extractedData.platform).toBe('instagram');
    });

    it.each([
      'add spotify',
      'connect my tiktok',
      'link my youtube account',
      'add twitter profile',
    ])('classifies "%s" as LINK_ADD', msg => {
      const intent = classifyIntent(msg);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.LINK_ADD);
    });

    it('classifies link add with URL', () => {
      const intent = classifyIntent(
        'add my instagram https://instagram.com/djshadow'
      );
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.LINK_ADD);
      expect(intent!.extractedData.url).toBe('https://instagram.com/djshadow');
    });
  });

  describe('link removals', () => {
    it.each([
      'remove my instagram',
      'delete spotify link',
      'disconnect tiktok',
      'unlink my twitter',
    ])('classifies "%s" as LINK_REMOVE', msg => {
      const intent = classifyIntent(msg);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.LINK_REMOVE);
    });

    it('extracts platform name', () => {
      const intent = classifyIntent('remove my instagram');
      expect(intent!.extractedData.platform).toBe('instagram');
    });
  });

  describe('avatar upload', () => {
    it.each([
      'upload my photo',
      'change my avatar',
      'update my profile picture',
      'set my pfp',
      'upload my headshot',
    ])('classifies "%s" as AVATAR_UPLOAD', msg => {
      const intent = classifyIntent(msg);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.AVATAR_UPLOAD);
    });
  });

  describe('settings toggles', () => {
    it.each([
      'enable tipping',
      'disable notifications',
      'turn on dark mode',
      'toggle public profile',
    ])('classifies "%s" as SETTINGS_TOGGLE', msg => {
      const intent = classifyIntent(msg);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.SETTINGS_TOGGLE);
    });
  });

  describe('AI fallthrough', () => {
    it.each([
      'help me write a bio',
      'what should I do to grow my audience?',
      'analyze my streaming stats',
      'create a release strategy',
      '',
      'hi',
    ])('returns null for "%s" (AI-required)', msg => {
      const intent = classifyIntent(msg);
      expect(intent).toBeNull();
    });

    it('returns null for messages over 300 characters', () => {
      const longMsg = 'change my name to ' + 'a'.repeat(300);
      const intent = classifyIntent(longMsg);
      expect(intent).toBeNull();
    });
  });
});

describe('isDeterministicIntent', () => {
  it('returns true for valid intents', () => {
    const intent = classifyIntent('change my name to Test');
    expect(isDeterministicIntent(intent)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isDeterministicIntent(null)).toBe(false);
  });
});
