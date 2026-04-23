import { describe, expect, it } from 'vitest';
import { composeMessage, serializeChip, type TrayChip } from './useChipTray';

const skill: TrayChip = {
  type: 'skill',
  id: 'generateAlbumArt',
  uid: 'u1',
};
const release: TrayChip = {
  type: 'entity',
  kind: 'release',
  id: 'rel_1',
  label: 'Midnight Drive',
  uid: 'u2',
};

describe('chip tray serialization', () => {
  it('serializes a skill chip to /skill:<id>', () => {
    expect(serializeChip(skill)).toBe('/skill:generateAlbumArt');
  });

  it('serializes an entity chip to @kind:id[label]', () => {
    expect(serializeChip(release)).toBe('@release:rel_1[Midnight Drive]');
  });

  it('composeMessage returns text as-is when tray is empty', () => {
    expect(composeMessage([], 'hello world')).toBe('hello world');
  });

  it('composeMessage prepends tray tokens + space to text', () => {
    expect(composeMessage([skill, release], 'please')).toBe(
      '/skill:generateAlbumArt @release:rel_1[Midnight Drive] please'
    );
  });

  it('composeMessage trims trailing whitespace off text', () => {
    expect(composeMessage([skill], '  ')).toBe('/skill:generateAlbumArt');
  });

  it('composeMessage returns tokens only when text is empty', () => {
    expect(composeMessage([release], '')).toBe(
      '@release:rel_1[Midnight Drive]'
    );
  });
});
