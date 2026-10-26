// Pricing-decision contract (Tim, 2026-10-26): a price or plan change must link a
// 5-year worst/base/best model whose best case clears the venture-scale bar.
// Pure policy; the caller supplies readFile so tests stay hermetic.

export const PRICING_PATH =
  /^(?:apps\/web\/lib\/config\/(?:plan-prices|pricing)\.ts|apps\/web\/lib\/entitlements\/registry\.ts|apps\/web\/lib\/billing\/offer-truth\.ts|apps\/web\/data\/marketingPricingPlans\.ts|apps\/web\/app\/\(marketing\)\/pricing\/[^/]+|apps\/web\/app\/api\/stripe\/pricing-options\/route\.ts)$/;

export const MODEL_PATH = /^docs\/pricing-models\/[A-Za-z0-9._-]+\.json$/;
const CASES = ['worst', 'base', 'best'];

export function touchesPricing(paths) {
  return paths.filter(path => PRICING_PATH.test(path));
}

export function modelReference(body) {
  const match = /^\s*pricing-model:\s*`?([^\s`]+)`?\s*$/im.exec(body ?? '');
  return match ? match[1] : '';
}

/** Minimum bar a model may declare: guards against lowering the bar to pass. */
export const MIN_BAR = { best_arr_usd: 100_000_000, by_year: 5 };

/** Returns an error string, or '' when the model clears the bar for `chosen`. */
export function checkModel(model) {
  const bar = model?.bar;
  if (!(bar?.best_arr_usd > 0) || !(bar?.by_year >= 1))
    return 'model has no bar (best_arr_usd, by_year).';
  if (!Array.isArray(model.assumptions) || model.assumptions.length === 0)
    return 'model lists no assumptions with sources.';
  const option = model.options?.[model.chosen];
  if (!option) return `chosen option "${model.chosen}" is not in options.`;
  for (const name of CASES) {
    const arr = option.arr?.[name];
    if (
      !Array.isArray(arr) ||
      arr.length < bar.by_year ||
      arr.some(n => !(n >= 0))
    )
      return `chosen option needs a ${bar.by_year}-year ARR array for ${name}.`;
  }
  const reached = option.arr.best[bar.by_year - 1];
  if (reached < bar.best_arr_usd)
    return `best-case year-${bar.by_year} ARR ${reached} is below the bar ${bar.best_arr_usd}.`;
  return '';
}

export function evaluatePricingModel({ paths, body, readFile }) {
  if (touchesPricing(paths).length === 0) return [];
  const prefix = `pricing-model: ${touchesPricing(paths).join(', ')} changes prices or plans; `;
  const ref = modelReference(body);
  if (!ref)
    return [
      `${prefix}add "pricing-model: docs/pricing-models/<name>.json" to the PR body.`,
    ];
  if (!MODEL_PATH.test(ref))
    return [
      `${prefix}reference must match docs/pricing-models/<name>.json, got ${ref}.`,
    ];
  let model;
  try {
    model = JSON.parse(readFile(ref));
  } catch {
    return [`${prefix}${ref} is missing or not valid JSON.`];
  }
  if (
    model?.bar?.best_arr_usd < MIN_BAR.best_arr_usd ||
    model?.bar?.by_year > MIN_BAR.by_year
  )
    return [
      `${prefix}${ref} lowers the bar below $100M best-case ARR by year 5.`,
    ];
  const problem = checkModel(model);
  return problem ? [`${prefix}${ref}: ${problem}`] : [];
}
