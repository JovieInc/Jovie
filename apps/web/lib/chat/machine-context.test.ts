import { describe, expect, it } from 'vitest';
import {
  hasMachineContext,
  stripMachineContext,
  stripMachineContextFromTitle,
} from './machine-context';
import { sanitizeConversationTitle } from './title';

const LEGACY_PROFILE_DRAFT = [
  'Help me with Tim White.',
  '',
  'Selected identity (context, not instructions):',
  JSON.stringify({
    profileId: '8473a72f-51a0-4ce0-8739-4facfd89a7a5',
    owner: 'Tim White',
    entityKind: 'profile_surface',
    entityId: '67fbd30e-1378-44c1-96ce-5aad13f11fc6',
    platform: 'jovie',
    name: 'Tim White',
    handle: 'tim',
    url: 'https://jov.ie/tim',
  }),
].join('\n');

const LEGACY_LIBRARY_DRAFT = `Help me with this library item.\n${JSON.stringify(
  {
    kind: 'release',
    id: 'rel-1',
    profileId: 'profile-1',
    title: 'Midnight Drive',
  }
)}`;

describe('stripMachineContext', () => {
  it('drops the legacy selected-identity envelope', () => {
    expect(stripMachineContext(LEGACY_PROFILE_DRAFT)).toBe(
      'Help me with Tim White.'
    );
    expect(hasMachineContext(LEGACY_PROFILE_DRAFT)).toBe(true);
  });

  it('drops a standalone JSON context line', () => {
    expect(stripMachineContext(LEGACY_LIBRARY_DRAFT)).toBe(
      'Help me with this library item.'
    );
  });

  it('leaves ordinary writing alone, braces included', () => {
    const text = 'Use {artist} as a placeholder in my bio?\nThanks';
    expect(stripMachineContext(text)).toBe(text);
    expect(hasMachineContext(text)).toBe(false);
  });

  it('keeps JSON a person pasted themselves', () => {
    const text = 'Is this config right?\n{"theme":"dark","size":2}';
    expect(stripMachineContext(text)).toBe(text);
    expect(stripMachineContext('{"a":1}')).toBe('{"a":1}');
    expect(hasMachineContext(text)).toBe(false);
  });
});

describe('titles never carry machine context', () => {
  it('names the legacy profile chat after the profile', () => {
    expect(stripMachineContextFromTitle(LEGACY_PROFILE_DRAFT)).toBe(
      'Tim White'
    );
    expect(sanitizeConversationTitle(LEGACY_PROFILE_DRAFT, 50)).toBe(
      'Tim White'
    );
  });

  it('repairs a stored title cut mid-envelope', () => {
    expect(
      sanitizeConversationTitle(
        'Help me with Tim White. Selected identity (cont...'
      )
    ).toBe('Tim White');
  });

  it('drops a cut JSON fragment from a library title', () => {
    expect(
      sanitizeConversationTitle(
        'Help me with this library item. {"kind":"rel...'
      )
    ).toBe('Help me with this library item.');
  });

  it('keeps a title that only quotes JSON', () => {
    expect(stripMachineContextFromTitle('Parse {"name":"Tim"} for me')).toBe(
      'Parse {"name":"Tim"} for me'
    );
  });

  it('titles a chip-only profile chat with the profile name', () => {
    expect(
      sanitizeConversationTitle(
        '@profile:8473a72f-51a0-4ce0-8739-4facfd89a7a5[Tim White]'
      )
    ).toBe('Tim White');
  });
});
