import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// JOV-6914/JOV-6945: a virtual model ID is a defined person. Identity fields
// are fixed; casting, persona, and generation policy are shared by every use.
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
const INDIVIDUALITY_AXES = ['mouth', 'face', 'hair', 'build', 'presence'];
const PERSONA_FIELDS = [
  'role',
  'scene',
  'lifestyleContext',
  'aestheticVocabulary',
  'likelyEnvironment',
  'aspiration',
];

function normalized(value) {
  return String(value).trim().toLowerCase();
}

function jaccard(left, right) {
  const a = new Set(left.map(normalized));
  const b = new Set(right.map(normalized));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return [...a].filter(value => b.has(value)).length / union.size;
}

export function similarityScore(left, right) {
  return (
    INDIVIDUALITY_AXES.reduce(
      (sum, axis) =>
        sum + jaccard(left.individuality[axis], right.individuality[axis]),
      0
    ) / INDIVIDUALITY_AXES.length
  );
}

export function siblingPairs(registry) {
  const pairs = [];
  const threshold =
    registry.castingBoard.similarityReview.nearDuplicateThreshold;
  for (let leftIndex = 0; leftIndex < registry.models.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < registry.models.length;
      rightIndex += 1
    ) {
      const left = registry.models[leftIndex];
      const right = registry.models[rightIndex];
      const score = similarityScore(left, right);
      if (score >= threshold) pairs.push(`${left.id}:${right.id}:${score}`);
    }
  }
  return pairs;
}

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
    if (
      model.selectionGates?.premiumAspirationalQuality !== 'pass' ||
      model.selectionGates?.icpResonance !== 'pass'
    )
      problems.push(`${model.id}: missing independent selection gates`);
    if (!Array.isArray(model.icpTags) || model.icpTags.length === 0)
      problems.push(`${model.id}: missing ICP tags`);
    for (const field of PERSONA_FIELDS)
      if (
        model.persona?.[field] === undefined ||
        model.persona[field] === '' ||
        (Array.isArray(model.persona[field]) &&
          model.persona[field].length === 0)
      )
        problems.push(`${model.id}: missing persona ${field}`);
    for (const axis of INDIVIDUALITY_AXES)
      if (
        !Array.isArray(model.individuality?.[axis]) ||
        model.individuality[axis].length === 0
      )
        problems.push(`${model.id}: missing individuality ${axis}`);
  }
  return problems;
}

test('every approved virtual model has a complete identity passport', () => {
  assert.equal(REGISTRY.schema, 'jovie-marketing-character-system/v2');
  assert.deepEqual(REGISTRY.views, [
    'portrait',
    'three-quarter',
    'full-body-front',
    'profile',
  ]);
  assert.deepEqual(passportProblems(REGISTRY), []);
});

test('casting board uses neutral comp-card logic and two independent gates', () => {
  const compCard = REGISTRY.castingBoard.compCard;
  assert.equal(REGISTRY.castingBoard.status, 'recertified');
  assert.match(compCard.background, /neutral|simple/i);
  assert.match(compCard.lighting, /controlled/i);
  assert.match(compCard.styling, /minimal/i);
  assert.match(compCard.wardrobe, /simple fitted/i);
  assert.match(compCard.grooming, /clean/i);
  assert.match(
    compCard.framing.find(frame => frame.view === 'full-body-front')
      .requirement,
    /complete head-to-toe|never crop the head/i
  );
  assert.ok(
    compCard.reject.some(value => /street or editorial imagery/i.test(value))
  );
  assert.deepEqual(
    REGISTRY.castingBoard.selectionGates.map(gate => [
      gate.id,
      gate.independent,
    ]),
    [
      ['premium-aspirational-quality', true],
      ['icp-resonance', true],
    ]
  );
});

test('machine-assisted individuality review rejects sibling candidates', () => {
  assert.deepEqual(REGISTRY.castingBoard.similarityReview.axes, [
    'mouth',
    'face',
    'hair',
    'build',
    'presence',
  ]);
  assert.match(REGISTRY.castingBoard.similarityReview.visualReview, /passed/);
  assert.deepEqual(siblingPairs(REGISTRY), []);

  const duplicate = structuredClone(REGISTRY.models[0]);
  duplicate.id = 'C99';
  const bad = structuredClone(REGISTRY);
  bad.models = [REGISTRY.models[0], duplicate];
  assert.equal(siblingPairs(bad).length, 1);
});

test('founder board decisions modify, keep, and kill the intended candidates', () => {
  const decisions = new Map(
    REGISTRY.boardDecisions.map(decision => [decision.id, decision])
  );
  const models = new Map(REGISTRY.models.map(model => [model.id, model]));

  assert.equal(decisions.get('C01').face, 'approved');
  assert.equal(decisions.get('C01').body, 'regenerate');
  assert.ok(!models.get('C01').traits.some(trait => /septum/i.test(trait)));
  assert.equal(models.get('C04').eyes, 'pale green');
  assert.equal(decisions.get('C04').body, 'review-open');
  assert.equal(models.get('C05').age, 22);
  assert.equal(decisions.get('C05').body, 'regenerate');
  assert.equal(decisions.get('C06').status, 'keep');
  assert.equal(
    jaccard(
      models.get('C05').individuality.mouth,
      models.get('C06').individuality.mouth
    ),
    0
  );
  for (const id of ['C07', 'C11']) {
    assert.equal(decisions.get(id).status, 'kill');
    assert.ok(REGISTRY.removed.includes(id));
    assert.ok(!models.has(id));
  }
});

test('generation policy is persona-first, coherent, aspirational, and physical', () => {
  const policy = REGISTRY.generationPolicy;
  assert.deepEqual(policy.personaFields, [
    'role',
    'scene',
    'lifestyleContext',
    'aestheticVocabulary',
    'likelyEnvironment',
    'aspiration',
    'icpTags',
  ]);
  assert.deepEqual(policy.worldCoherence.requiredParts, [
    'character',
    'wardrobe',
    'environment',
    'props',
    'activity',
    'lighting',
  ]);
  assert.match(policy.worldCoherence.requirement, /generic stock.*rejected/i);
  assert.match(policy.nosePiercing, /no septum or bull-ring/i);
  assert.match(policy.photography.qualityBar, /extremely aspirational/i);
  assert.match(policy.photography.realismRule, /never average/i);
  assert.match(
    policy.compositePhysics.directionalCoherence,
    /declared vectors/i
  );
  assert.match(policy.compositePhysics.lightCoherence, /shadow|reflection/i);
  assert.match(
    REGISTRY.castingBoard.groupScenes.forbiddenDifferentiation,
    /protected characteristics/i
  );
});

test('character system pins rather than forks Bubblegum Factory and Ops canon', () => {
  assert.deepEqual(
    REGISTRY.sourceCanon.map(source => [source.repository, source.commit]),
    [
      ['JovieInc/BubblegumFactory', 'bd0f91142346f37bba8d94ca422d30e65a0da5d6'],
      ['JovieInc/Ops', '00cc0721e89831c12a4441a233ab7f385de0b17f'],
    ]
  );
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
        selectionGates: {
          premiumAspirationalQuality: 'pass',
          icpResonance: 'pass',
        },
        icpTags: ['independent artist'],
        persona: Object.fromEntries(PERSONA_FIELDS.map(field => [field, 'x'])),
        individuality: Object.fromEntries(
          INDIVIDUALITY_AXES.map(axis => [axis, ['x']])
        ),
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
