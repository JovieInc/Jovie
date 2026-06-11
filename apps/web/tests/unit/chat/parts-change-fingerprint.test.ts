import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { getPartsChangeFingerprint } from '@/components/jovie/utils';

describe('getPartsChangeFingerprint', () => {
  it('changes when streamed text grows without JSON.stringify', () => {
    const shortParts = [{ type: 'text', text: 'Hi' }] as UIMessage['parts'];
    const longParts = [
      { type: 'text', text: 'Hello there' },
    ] as UIMessage['parts'];

    expect(getPartsChangeFingerprint(shortParts)).not.toBe(
      getPartsChangeFingerprint(longParts)
    );
  });

  it('stays stable when part references change but content is unchanged', () => {
    const first = [{ type: 'text', text: 'Same' }] as UIMessage['parts'];
    const second = [{ type: 'text', text: 'Same' }] as UIMessage['parts'];

    expect(getPartsChangeFingerprint(first)).toBe(
      getPartsChangeFingerprint(second)
    );
  });

  it('includes tool state transitions in the fingerprint', () => {
    const pending = [
      {
        type: 'tool-generateReleasePitch',
        state: 'input-available',
      },
    ] as UIMessage['parts'];
    const completed = [
      {
        type: 'tool-generateReleasePitch',
        state: 'output-available',
      },
    ] as UIMessage['parts'];

    expect(getPartsChangeFingerprint(pending)).not.toBe(
      getPartsChangeFingerprint(completed)
    );
  });
});
