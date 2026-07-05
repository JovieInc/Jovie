/** @typedef {import('./types.mjs').QaSwarmRecipeId} QaSwarmRecipeId */

/**
 * @typedef {object} QaSwarmRecipe
 * @property {QaSwarmRecipeId} id
 * @property {string} command
 * @property {string} skillInvocation
 * @property {string} title
 * @property {string} description
 * @property {readonly string[]} labels
 * @property {readonly string[]} gstackSkills
 * @property {readonly string[]} verificationCommands
 */

/** @type {readonly QaSwarmRecipe[]} */
export const QA_SWARM_RECIPES = [
  {
    id: 'diff-review',
    command: 'qa-swarm-diff-review',
    skillInvocation: '/qa-swarm-diff-review',
    title: 'Diff-review swarm',
    description:
      'Multi-model PR diff review. Runs /review plus cross-model challenge on the active branch diff.',
    labels: ['testing', 'codex'],
    gstackSkills: ['/review', '/benchmark-models'],
    verificationCommands: [
      'pnpm run typecheck',
      'pnpm --filter @jovie/web run test:fast',
    ],
  },
  {
    id: 'explore',
    command: 'qa-swarm-explore',
    skillInvocation: '/qa-swarm-explore',
    title: 'Exploratory test swarm',
    description:
      'Goal-driven exploratory QA across web (/browse, /qa) and iOS (XCUITest driver on real builds).',
    labels: ['testing', 'qa:perf'],
    gstackSkills: ['/qa', '/browse', '/ios-qa'],
    verificationCommands: ['pnpm run test:web:smoke'],
  },
  {
    id: 'vision-critique',
    command: 'qa-swarm-vision',
    skillInvocation: '/qa-swarm-vision',
    title: 'Vision-critique swarm',
    description:
      'Screenshot surfaces and score polish 1-10. Flags broken or janky UI with evidence paths.',
    labels: ['testing', 'ux', 'ui'],
    gstackSkills: ['/design-review', '/browse'],
    verificationCommands: [
      'pnpm --filter @jovie/web run test:lighthouse:public:launch',
    ],
  },
  {
    id: 'design-jury',
    command: 'qa-swarm-design-jury',
    skillInvocation: '/qa-swarm-design-jury',
    title: 'Multi-LLM design jury',
    description:
      'Change-aware screenshot capture plus multi-model taste jury toward gbrain-captured preferences.',
    labels: ['testing', 'ux', 'ui'],
    gstackSkills: ['/plan-design-review', '/design-review', '/design-shotgun'],
    verificationCommands: [
      'pnpm --filter @jovie/web exec vitest run tests/unit/agent-os/design-lab/review.test.ts',
    ],
  },
  {
    id: 'test-gen',
    command: 'qa-swarm-test-gen',
    skillInvocation: '/qa-swarm-test-gen',
    title: 'Test-gen and fuzz swarm',
    description:
      'Generate and fuzz high-risk behaviors (sync contracts, billing states, parsers) using nightly-test-agent patterns.',
    labels: ['testing'],
    gstackSkills: ['/qa'],
    verificationCommands: [
      'pnpm --filter @jovie/web run test:nightly-agent:select',
      'pnpm --filter @jovie/web run test:fast',
    ],
  },
  {
    id: 'flaky-hunter',
    command: 'qa-swarm-flaky-hunter',
    skillInvocation: '/qa-swarm-flaky-hunter',
    title: 'Flaky-hunter swarm',
    description:
      'Re-run suspect tests, cluster flakes, and auto-quarantine only when reproduction is stable.',
    labels: ['testing'],
    gstackSkills: ['/qa'],
    verificationCommands: [
      'pnpm run test:flaky',
      'pnpm run test:quarantine-ledger',
    ],
  },
];

/** @type {Readonly<Record<QaSwarmRecipeId, QaSwarmRecipe>>} */
export const QA_SWARM_RECIPE_BY_ID = Object.fromEntries(
  QA_SWARM_RECIPES.map(recipe => [recipe.id, recipe])
);

/**
 * @param {string} recipeId
 */
export function getRecipe(recipeId) {
  const recipe =
    QA_SWARM_RECIPE_BY_ID[/** @type {QaSwarmRecipeId} */ (recipeId)];
  if (!recipe) {
    throw new Error(`Unknown QA swarm recipe: ${recipeId}`);
  }
  return recipe;
}

/**
 * @param {string} commandName
 */
export function getRecipeByCommand(commandName) {
  const recipe = QA_SWARM_RECIPES.find(
    candidate => candidate.command === commandName
  );
  if (!recipe) {
    throw new Error(`Unknown QA swarm command: ${commandName}`);
  }
  return recipe;
}
