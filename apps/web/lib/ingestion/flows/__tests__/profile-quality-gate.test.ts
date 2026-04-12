import { describe, expect, it } from 'vitest';
import {
  evaluateProfileQuality,
  isEmbarrassingDisplayName,
} from '../profile-quality-gate';

describe('isEmbarrassingDisplayName', () => {
  it('returns true for empty string', () => {
    expect(isEmbarrassingDisplayName('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isEmbarrassingDisplayName('   ')).toBe(true);
    expect(isEmbarrassingDisplayName('\t\n')).toBe(true);
  });

  it('returns true for "undefined" (case-insensitive)', () => {
    expect(isEmbarrassingDisplayName('undefined')).toBe(true);
    expect(isEmbarrassingDisplayName('Undefined')).toBe(true);
    expect(isEmbarrassingDisplayName('UNDEFINED')).toBe(true);
  });

  it('returns true for "null" (case-insensitive)', () => {
    expect(isEmbarrassingDisplayName('null')).toBe(true);
    expect(isEmbarrassingDisplayName('Null')).toBe(true);
    expect(isEmbarrassingDisplayName('NULL')).toBe(true);
  });

  it('returns true for numeric-only strings', () => {
    expect(isEmbarrassingDisplayName('12345')).toBe(true);
    expect(isEmbarrassingDisplayName('4829173')).toBe(true);
    expect(isEmbarrassingDisplayName('0')).toBe(true);
  });

  it('returns true for URLs containing http(s)', () => {
    expect(isEmbarrassingDisplayName('https://example.com')).toBe(true);
    expect(isEmbarrassingDisplayName('http://linktree.com/djname')).toBe(true);
    expect(isEmbarrassingDisplayName('check out https://spotify.com')).toBe(
      true
    );
  });

  it('returns true for www. prefix', () => {
    expect(isEmbarrassingDisplayName('www.example.com')).toBe(true);
    expect(isEmbarrassingDisplayName('WWW.example.com')).toBe(true);
  });

  it('returns true for "artist_" prefix', () => {
    expect(isEmbarrassingDisplayName('artist_4829173')).toBe(true);
    expect(isEmbarrassingDisplayName('artist_abc')).toBe(true);
  });

  it('returns false for normal artist names', () => {
    expect(isEmbarrassingDisplayName('DJ Shadow')).toBe(false);
    expect(isEmbarrassingDisplayName('Skrillex')).toBe(false);
    expect(isEmbarrassingDisplayName('deadmau5')).toBe(false);
    expect(isEmbarrassingDisplayName('ODESZA')).toBe(false);
    expect(isEmbarrassingDisplayName('Above & Beyond')).toBe(false);
  });

  it('returns false for handle-style names with numbers', () => {
    expect(isEmbarrassingDisplayName('dj_xyz_123')).toBe(false);
    expect(isEmbarrassingDisplayName('bass_head99')).toBe(false);
  });

  it('returns false for single-character names', () => {
    expect(isEmbarrassingDisplayName('X')).toBe(false);
  });
});

describe('evaluateProfileQuality', () => {
  it('passes when all criteria are met', () => {
    const result = evaluateProfileQuality({
      displayName: 'DJ Shadow',
      avatarUrl: 'https://blob.vercel-storage.com/avatars/djshadow.avif',
      linkCount: 3,
    });

    expect(result.isPublic).toBe(true);
    expect(result.quarantineReasons).toHaveLength(0);
  });

  it('fails when avatar is missing', () => {
    const result = evaluateProfileQuality({
      displayName: 'DJ Shadow',
      avatarUrl: null,
      linkCount: 2,
    });

    expect(result.isPublic).toBe(false);
    expect(result.quarantineReasons).toHaveLength(1);
    expect(result.quarantineReasons[0]).toContain('avatar');
  });

  it('fails when avatar is empty string', () => {
    const result = evaluateProfileQuality({
      displayName: 'DJ Shadow',
      avatarUrl: '',
      linkCount: 2,
    });

    expect(result.isPublic).toBe(false);
    expect(result.quarantineReasons).toHaveLength(1);
    expect(result.quarantineReasons[0]).toContain('avatar');
  });

  it('fails when display name is embarrassing', () => {
    const result = evaluateProfileQuality({
      displayName: 'undefined',
      avatarUrl: 'https://blob.example.com/avatar.avif',
      linkCount: 1,
    });

    expect(result.isPublic).toBe(false);
    expect(result.quarantineReasons).toHaveLength(1);
    expect(result.quarantineReasons[0]).toContain('Display name');
  });

  it('fails when link count is zero', () => {
    const result = evaluateProfileQuality({
      displayName: 'DJ Shadow',
      avatarUrl: 'https://blob.example.com/avatar.avif',
      linkCount: 0,
    });

    expect(result.isPublic).toBe(false);
    expect(result.quarantineReasons).toHaveLength(1);
    expect(result.quarantineReasons[0]).toContain('links');
  });

  it('collects multiple failure reasons', () => {
    const result = evaluateProfileQuality({
      displayName: '',
      avatarUrl: null,
      linkCount: 0,
    });

    expect(result.isPublic).toBe(false);
    expect(result.quarantineReasons).toHaveLength(3);
  });

  it('handles whitespace-padded avatar URL', () => {
    const result = evaluateProfileQuality({
      displayName: 'DJ Shadow',
      avatarUrl: '   ',
      linkCount: 1,
    });

    expect(result.isPublic).toBe(false);
    expect(result.quarantineReasons[0]).toContain('avatar');
  });
});
