import {
  createCanonicalMusicalKey,
  MUSICAL_KEY_MODES,
  MUSICAL_KEY_TONICS,
} from '@jovie/audio-contracts';
import { describe, expect, it } from 'vitest';
import {
  OpenKeyScanProtocolError,
  parseOpenKeyScanProviderMessage,
} from './openkeyscan-protocol';

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';
const AUDIO_PATH = '/private/audio/example.mp3';

function success(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: REQUEST_ID,
    status: 'success',
    camelot: '11B',
    openkey: '4d',
    key: 'A major',
    class_id: 22,
    filename: 'example.mp3',
    generation: 0,
    ...overrides,
  };
}

describe('OpenKeyScan provider protocol', () => {
  it('normalizes every canonical Camelot class without trusting display text', () => {
    for (const mode of MUSICAL_KEY_MODES) {
      for (const tonic of MUSICAL_KEY_TONICS) {
        const key = createCanonicalMusicalKey(tonic, mode);
        const classId =
          Number.parseInt(key.camelot, 10) -
          1 +
          (key.camelot.endsWith('B') ? 12 : 0);

        expect(
          parseOpenKeyScanProviderMessage(
            success({
              camelot: key.camelot,
              openkey: key.openKey,
              key: key.traditional,
              class_id: classId,
            }),
            AUDIO_PATH
          )
        ).toEqual({
          status: 'success',
          id: REQUEST_ID,
          filename: 'example.mp3',
          generation: 0,
          classId,
          key,
        });
      }
    }
  });

  it.each([
    ['C# major', 'Db major', '3B', '8d', 14],
    ['D# minor', 'Eb minor', '2A', '7m', 1],
    ['F# major', 'Gb major', '2B', '7d', 13],
    ['G# minor', 'Ab minor', '1A', '6m', 0],
    ['A# major', 'Bb major', '6B', '11d', 17],
  ] as const)('accepts consistent enharmonic provider names %s/%s', (sharp, flat, camelot, openkey, classId) => {
    expect(
      parseOpenKeyScanProviderMessage(
        success({
          camelot,
          openkey,
          key: `${flat}/${sharp}`,
          class_id: classId,
        }),
        AUDIO_PATH
      )
    ).toMatchObject({
      status: 'success',
      classId,
    });
  });

  it.each([
    ['Camelot', { camelot: '8B' }],
    ['Open Key', { openkey: '1d' }],
    ['class id', { class_id: 0 }],
    ['traditional key', { key: 'C major' }],
    ['mode', { key: 'A minor' }],
    ['mixed enharmonics', { key: 'A major/C major' }],
    ['traditional prefix', { key: 'prefix A major' }],
    ['traditional suffix', { key: 'A major suffix' }],
    ['missing traditional tonic', { key: 'major' }],
    ['filename', { filename: 'other.mp3' }],
  ])('rejects inconsistent %s metadata', (_label, overrides) => {
    try {
      parseOpenKeyScanProviderMessage(success(overrides), AUDIO_PATH);
      throw new Error('expected protocol rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenKeyScanProtocolError);
      expect(error).toMatchObject({
        name: 'OpenKeyScanProtocolError',
        message: 'analyzer returned inconsistent key metadata',
      });
    }
  });

  it('trims each consistent traditional-key variant', () => {
    expect(
      parseOpenKeyScanProviderMessage(
        success({ key: '  A major / A major  ' }),
        AUDIO_PATH
      )
    ).toMatchObject({ status: 'success', classId: 22 });
  });

  it.each([
    ['unknown field', { extra: true }],
    ['invalid id', { id: 'not-a-uuid' }],
    ['invalid status', { status: 'pending' }],
    ['invalid generation', { generation: -1 }],
    ['invalid class', { class_id: 24 }],
    ['invalid notation', { camelot: '13B' }],
  ])('rejects %s', (_label, overrides) => {
    try {
      parseOpenKeyScanProviderMessage(success(overrides), AUDIO_PATH);
      throw new Error('expected protocol rejection');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'OpenKeyScanProtocolError',
        message: 'analyzer returned an invalid response',
      });
    }
  });

  it('accepts a matching provider error while discarding its detail', () => {
    expect(
      parseOpenKeyScanProviderMessage(
        {
          id: REQUEST_ID,
          status: 'error',
          error: 'sensitive path and decoder detail',
          filename: 'example.mp3',
          generation: 2,
        },
        AUDIO_PATH
      )
    ).toEqual({
      status: 'error',
      id: REQUEST_ID,
      filename: 'example.mp3',
      generation: 2,
    });
  });

  it.each([
    ['wrong filename', { filename: 'other.mp3' }],
    ['missing detail', { error: '' }],
    ['unknown field', { extra: true }],
  ])('rejects a provider error with %s', (_label, overrides) => {
    expect(() =>
      parseOpenKeyScanProviderMessage(
        {
          id: REQUEST_ID,
          status: 'error',
          error: 'provider detail',
          filename: 'example.mp3',
          generation: 0,
          ...overrides,
        },
        AUDIO_PATH
      )
    ).toThrow(OpenKeyScanProtocolError);
  });
});
