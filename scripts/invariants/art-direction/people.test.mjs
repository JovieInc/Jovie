import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { check, classifyPersonImage, validateRegistry } from './people.mjs';

const tim = {
  id: 'tim-white',
  name: 'Tim White',
  consent: 'self',
  provenance: 'Tim White own photos',
  source: 'own-photo',
};

describe('approved people registry', () => {
  it('accepts Tim with his own photos', () => {
    assert.deepEqual(
      validateRegistry(
        { people: [tim], images: [{ path: 'a.jpg', person: 'tim-white' }] },
        () => true
      ),
      []
    );
  });

  it('rejects missing consent, provenance and unknown people', () => {
    const errors = validateRegistry(
      {
        people: [{ id: 'x', name: 'X', source: 'own-photo' }],
        images: [{ path: 'b.jpg', person: 'nobody' }],
      },
      () => false
    );
    assert.ok(errors.some(error => /consent/u.test(error)));
    assert.ok(errors.some(error => /provenance/u.test(error)));
    assert.ok(errors.some(error => /unknown person/u.test(error)));
    assert.ok(errors.some(error => /does not exist/u.test(error)));
  });

  it('bans generated and stock people unless approved by name and date', () => {
    for (const source of ['generated', 'stock']) {
      const bare = validateRegistry(
        { people: [{ ...tim, source }], images: [] },
        () => true
      );
      assert.ok(
        bare.some(error => /banned/u.test(error)),
        source
      );
      const approved = validateRegistry(
        {
          people: [
            { ...tim, source, approvedBy: 'Tim', approvedOn: '2026-10-25' },
          ],
          images: [],
        },
        () => true
      );
      assert.deepEqual(approved, [], source);
    }
  });

  it('flags person images by sidecar, directory and name', () => {
    assert.equal(
      classifyPersonImage('apps/web/public/x.webp', { subject: 'person' }),
      true
    );
    assert.equal(
      classifyPersonImage('apps/web/public/images/avatars/eli.jpg'),
      true
    );
    assert.equal(
      classifyPersonImage('apps/web/public/images/avatars/mic.jpg', {
        subject: 'object',
      }),
      false
    );
    assert.equal(
      classifyPersonImage('apps/web/public/images/hero/P07-portrait.webp'),
      true
    );
    assert.equal(
      classifyPersonImage('apps/web/public/images/hero/stock-woman.jpg'),
      true
    );
    assert.equal(
      classifyPersonImage('apps/web/public/images/hero/night-desk.webp'),
      false
    );
  });

  it('matches the registry with no unapproved person image', async () => {
    assert.deepEqual((await check()).failures, []);
  });
});
