import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRAME_ROLES,
  keyframePasses,
  MOTION_KEYFRAME_QUESTIONS,
  PAGE_COMPOSITION_QUESTIONS,
  reviewRequest,
} from './frame-roles.mjs';

test('final path: the page-composition rubric runs', () => {
  const req = reviewRequest({ role: 'final', note: 'Homepage 1440.' });
  assert.equal(req.role, 'final');
  assert.deepEqual(
    Object.keys(req.questions),
    Object.keys(PAGE_COMPOSITION_QUESTIONS)
  );
  for (const key of [
    'polish',
    'hierarchy',
    'mockup_quality',
    'copy_length',
    'grid',
  ])
    assert.ok(key in req.questions, key);
  assert.match(req.preamble, /finished page/);
});

test('transition-keyframe path: only the motion rubric runs, no page-composition questions', () => {
  const req = reviewRequest({
    role: 'transition-keyframe',
    note: 'Zoom at 50%.',
  });
  assert.deepEqual(
    Object.keys(req.questions),
    Object.keys(MOTION_KEYFRAME_QUESTIONS)
  );
  for (const key of ['legible', 'headline_collision', 'anchors'])
    assert.ok(key in req.questions, key);
  for (const key of [
    'copy_length',
    'expensive',
    'brand_fit',
    'polish',
    'hierarchy',
    'grid',
    'focal',
  ])
    assert.ok(!(key in req.questions), `${key} must not judge a keyframe`);
  assert.match(req.preamble, /not a finished page/);
});

test('deliberate red: a missing or unknown role is refused, never defaulted to a page', () => {
  assert.throws(() => reviewRequest({}), /frame role must be one of/);
  assert.throws(
    () => reviewRequest({ role: 'page' }),
    /frame role must be one of/
  );
  assert.deepEqual([...FRAME_ROLES], ['final', 'transition-keyframe']);
});

test('keyframe verdict needs legible, no collision and consistent anchors', () => {
  assert.equal(
    keyframePasses({
      legible: 'legible',
      headline_collision: 'clear',
      anchors: 'consistent',
    }),
    true
  );
  assert.equal(
    keyframePasses({
      legible: 'legible',
      headline_collision: 'collides',
      anchors: 'consistent',
    }),
    false
  );
  assert.equal(
    keyframePasses({
      legible: 'legible',
      headline_collision: 'clear',
      anchors: 'drifting',
    }),
    false
  );
});
