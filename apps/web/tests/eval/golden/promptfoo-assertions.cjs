/**
 * Deterministic golden-case assertions for the Promptfoo CI eval gate.
 *
 * Delegates to shared scorer modules in apps/web/lib/eval/scorers/.
 */

const path = require('node:path');
const { register } = require('tsx/cjs/api');

register({
  tsconfig: path.join(__dirname, '../../../tsconfig.json'),
});

const {
  runDeterministicScorers,
} = require('../../../lib/eval/scorers/core.ts');

function parseOutput(output) {
  if (output && typeof output === 'object') {
    return String(output.text ?? output.output ?? '');
  }
  return String(output ?? '');
}

function pass(reason = 'Assertion passed') {
  return { pass: true, score: 1, reason };
}

function fail(reason) {
  return { pass: false, score: 0, reason };
}

function getVars(context) {
  return context?.vars ?? context?.test?.vars ?? {};
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item));
  }
  if (typeof value === 'string' && value.length > 0) {
    return value
      .split('|')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function assertGoldenDeterministic(output, context) {
  const vars = getVars(context);
  const response = parseOutput(output);
  const caseName = String(vars.caseName ?? vars.description ?? 'golden-case');

  const scored = runDeterministicScorers({
    caseName,
    userPrompt: String(vars.input ?? ''),
    assistantResponse: response,
    mustSay: parseStringArray(vars.mustSay),
    mustNotSay: parseStringArray(vars.mustNotSay),
    harmfulBlacklist: parseStringArray(vars.harmfulBlacklist),
    voiceException:
      vars.voiceException === true || vars.voiceException === 'true',
    mustNotLeakPrompt: true,
  });

  for (const result of scored.results) {
    if (result.verdict === 'fail') {
      return fail(result.reason);
    }
  }

  return pass(`[${caseName}] deterministic golden assertions passed`);
}

module.exports = {
  assertGoldenDeterministic,
};
