import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// JOV-6914: a virtual model ID is a defined person. Identity fields are fixed
// once here and inherited by every render; styling and shoot vary per render.
const REGISTRY = JSON.parse(
  readFileSync(
    new URL('../../canon/virtual-models.json', import.meta.url),
    'utf8'
  )
);
const IDENTITY = [
  'sex',
  'age',
  'heightCm',
  'build',
  'shoeEu',
  'hair',
  'eyes',
  'face',
];
const STYLING = /\b(tee|tank|jeans|jacket|vest|cargo|dress|makeup|pose)\b/i;

export function passportProblems(registry) {
  const problems = [];
  const seen = new Set();
  for (const model of registry.models) {
    if (!/^C\d{2}$/.test(model.id)) problems.push(`${model.id}: bad id`);
    if (seen.has(model.id)) problems.push(`${model.id}: duplicate`);
    seen.add(model.id);
    if (registry.removed.includes(model.id))
      problems.push(`${model.id}: removed but listed`);
    for (const field of IDENTITY)
      if (model[field] === undefined || model[field] === '')
        problems.push(`${model.id}: missing ${field}`);
    if (
      !Number.isInteger(model.heightCm) ||
      model.heightCm < 150 ||
      model.heightCm > 205
    )
      problems.push(`${model.id}: heightCm must be an explicit integer`);
    if (!(model.age >= 21)) problems.push(`${model.id}: must be an adult 21+`);
    for (const field of ['hair', 'eyes', 'face'])
      if (STYLING.test(String(model[field] ?? '')))
        problems.push(`${model.id}: ${field} mixes styling into identity`);
  }
  return problems;
}

test('every approved virtual model has a complete identity passport', () => {
  assert.equal(REGISTRY.schema, 'jovie-virtual-model-passport/v1');
  assert.deepEqual(REGISTRY.views, [
    'headshot',
    'three-quarter',
    'full-body-front',
    'profile',
  ]);
  assert.deepEqual(passportProblems(REGISTRY), []);
});

test('deliberate red: rejects drifting, incomplete, or styled identities', () => {
  const bad = {
    removed: ['C08'],
    models: [
      {
        id: 'C08',
        sex: 'man',
        age: 30,
        heightCm: 180,
        build: 'lean',
        shoeEu: 43,
        hair: 'x',
        eyes: 'x',
        face: 'x',
      },
      {
        id: 'C20',
        sex: 'woman',
        age: 19,
        heightCm: 5.9,
        build: 'lean',
        shoeEu: 38,
        hair: 'blonde with white tee',
        eyes: 'blue',
        face: '',
      },
    ],
  };
  const problems = passportProblems(bad);
  assert.ok(problems.includes('C08: removed but listed'));
  assert.ok(problems.includes('C20: heightCm must be an explicit integer'));
  assert.ok(problems.includes('C20: must be an adult 21+'));
  assert.ok(problems.includes('C20: missing face'));
  assert.ok(problems.includes('C20: hair mixes styling into identity'));
});
