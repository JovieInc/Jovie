import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepare,
  releaseMetadataUpdate,
  selectRecoverableProductionDraft,
} from './desktop-release-assets.mjs';

// JOV-12609: a production Desktop release run rejected by Apple notarization
// left a private, never-published, asset-less draft release whose
// target_commitish points at an older commit. Every later prepare then died
// with 'Release target is not the authorized commit' because the production
// path, unlike staging, never retargeted an existing exact-tag draft. These
// cases live apart from desktop-release-publisher.test.mjs to honor its
// size-500 budget (scripts/company-guards/size-baseline.json).
//
// JOV-12659: retargeting that draft with a target-only PATCH made GitHub
// rename the draft's tag to untagged-* (a draft tag has no git ref yet), so
// the retarget now sends full metadata (name, prerelease, tag_name,
// target_commitish) and a draft already renamed to untagged-* is repaired by
// the existing recovery path instead of wedging the release.
//
// Refusal cases assert a rejection under EITHER guard wording: the pre-fix
// envelope invariant ('Release target is not the authorized commit') and the
// retarget guard ('A non-empty or public release cannot be retargeted') both
// fail closed, so these tests pass before and after the retarget fix and pin
// the refusal against regression in either phase.

const AUTHORIZED = 'b'.repeat(40);
const STALE = 'a'.repeat(40);
const VERSION = '26.11.3';
const RENAMED_TAG = `untagged-${STALE.slice(0, 20)}`;
const RETARGET_REJECTION = /cannot be retargeted|not the authorized commit/;

function draftClient(overrides = {}) {
  const client = {
    release: {
      id: 445189348,
      tag_name: `v${VERSION}`,
      target_commitish: STALE,
      name: VERSION,
      draft: true,
      prerelease: false,
      published_at: null,
      assets: [],
    },
    metadataUpdates: 0,
    retargets: 0,
  };
  Object.assign(client.release, overrides);
  client.releaseOrDraftByTag = async () => client.release;
  client.releaseById = async () => client.release;
  client.recoverableProductionDraft = async input =>
    selectRecoverableProductionDraft([client.release], input);
  // The JOV-12659 bug primitive: a target-only PATCH on a draft whose tag has
  // no git ref renames the tag to untagged-*. prepare must never call it.
  client.retargetEmptyDraft = async (_id, releaseSha) => {
    client.retargets += 1;
    client.release.target_commitish = releaseSha;
    client.release.tag_name = RENAMED_TAG;
    return client.release;
  };
  client.updateReleaseMetadata = async input => {
    client.metadataUpdates += 1;
    Object.assign(client.release, releaseMetadataUpdate(input));
    return client.release;
  };
  client.createDraft = async () => {
    throw new Error('prepare must not create a draft for an existing tag');
  };
  return client;
}

function prepareInput(client) {
  return {
    client,
    environment: 'production',
    installedVersion: VERSION,
    releaseSha: AUTHORIZED,
    version: VERSION,
  };
}

test('production prepare retargets a stale asset-less unpublished exact-tag draft with full metadata', async () => {
  const client = draftClient();
  await prepare(prepareInput(client));
  assert.equal(client.retargets, 0, 'target-only retarget must not be used');
  assert.equal(client.metadataUpdates, 1);
  assert.equal(client.release.target_commitish, AUTHORIZED);
  // The regression: the tag must stay exact, not become untagged-*.
  assert.equal(client.release.tag_name, `v${VERSION}`);
  assert.equal(client.release.draft, true);
  assert.equal(client.release.published_at, null);
  assert.deepEqual(client.release.assets, []);
});

test('production prepare skips retargeting when the target already matches', async () => {
  const client = draftClient({ target_commitish: AUTHORIZED });
  await prepare(prepareInput(client));
  assert.equal(client.retargets, 0);
  assert.equal(client.metadataUpdates, 0);
  assert.equal(client.release.target_commitish, AUTHORIZED);
  assert.equal(client.release.tag_name, `v${VERSION}`);
});

test('production prepare repairs a draft already renamed to untagged-*', async () => {
  const client = draftClient({ tag_name: RENAMED_TAG });
  client.releaseOrDraftByTag = async (_tag, allowNotFound) => {
    assert.equal(allowNotFound, true, 'tag lookup must tolerate a miss');
    return null;
  };
  await prepare(prepareInput(client));
  assert.equal(client.metadataUpdates, 1);
  assert.equal(client.retargets, 0);
  // tag_name restored and target moved to the authorized commit.
  assert.equal(client.release.tag_name, `v${VERSION}`);
  assert.equal(client.release.target_commitish, AUTHORIZED);
  assert.equal(client.release.draft, true);
  assert.deepEqual(client.release.assets, []);
});

test('production recovery selector repairs any stale target and fails closed on two matches', () => {
  // JOV-12659: a renamed untagged-* draft carries the failed run's stale
  // target — the selector must still return it (the metadata update repairs
  // the target), and two recoverable drafts stay a fail-closed ambiguity.
  for (const target of [STALE, STALE.slice(0, 7), 'main']) {
    const draft = draftClient({
      tag_name: RENAMED_TAG,
      target_commitish: target,
    }).release;
    assert.equal(
      selectRecoverableProductionDraft([draft], {
        releaseSha: AUTHORIZED,
        version: VERSION,
      })?.target_commitish,
      target
    );
  }
  assert.throws(
    () =>
      selectRecoverableProductionDraft(
        [
          draftClient({ tag_name: RENAMED_TAG }).release,
          draftClient({ id: 445189349, tag_name: RENAMED_TAG }).release,
        ],
        { releaseSha: AUTHORIZED, version: VERSION }
      ),
    /Multiple recoverable production drafts exist/
  );
});

test('production prepare still refuses a published release targeting an older commit', async () => {
  const client = draftClient({
    draft: false,
    published_at: '2026-11-14T09:52:00Z',
  });
  const before = structuredClone(client.release);
  await assert.rejects(prepare(prepareInput(client)), RETARGET_REJECTION);
  assert.deepEqual(client.release, before);
  assert.equal(client.metadataUpdates, 0);
  assert.equal(client.retargets, 0);
});

test('production prepare still refuses a stale exact-tag draft that holds assets', async () => {
  const client = draftClient({
    assets: [{ id: 1, name: `Jovie-${VERSION}-universal.dmg` }],
  });
  const before = structuredClone(client.release);
  await assert.rejects(prepare(prepareInput(client)), RETARGET_REJECTION);
  assert.deepEqual(client.release, before);
  assert.equal(client.metadataUpdates, 0);
  assert.equal(client.retargets, 0);
});
