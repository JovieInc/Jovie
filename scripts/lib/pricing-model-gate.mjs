// Pricing-decision contract (Tim, 2026-10-26): a price or plan change must link a
// 3-year worst/base/best model whose best case clears the venture-scale bar.
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

/** Returns an error string, or '' when the model clears the bar for `chosen`. */
export function checkModel(model) {
  const bar = model?.bar;
  if (!bar || !(bar.best_y3_arr_usd > 0) || !(bar.best_y3_growth_min > 0))
    return 'model has no bar (best_y3_arr_usd, best_y3_growth_min).';
  if (!Array.isArray(model.assumptions) || model.assumptions.length === 0)
    return 'model lists no assumptions with sources.';
  const option = model.options?.[model.chosen];
  if (!option) return `chosen option "${model.chosen}" is not in options.`;
  for (const name of CASES) {
    const arr = option.arr?.[name];
    if (!Array.isArray(arr) || arr.length !== 3 || arr.some(n => !(n >= 0)))
      return `chosen option needs a 3-year ARR array for ${name}.`;
  }
  const best = option.arr.best;
  const growth = best[1] > 0 ? best[2] / best[1] : 0;
  if (best[2] < bar.best_y3_arr_usd)
    return `best-case year-3 ARR ${best[2]} is below the bar ${bar.best_y3_arr_usd}.`;
  if (growth < bar.best_y3_growth_min)
    return `best-case year-3 growth ${growth.toFixed(2)}x is below ${bar.best_y3_growth_min}x.`;
  return '';
}

/** Minimum bar a model may declare: guards against lowering the bar to pass. */
export const MIN_BAR = { best_y3_arr_usd: 30_000_000, best_y3_growth_min: 2 };

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
    model?.bar?.best_y3_arr_usd < MIN_BAR.best_y3_arr_usd ||
    model?.bar?.best_y3_growth_min < MIN_BAR.best_y3_growth_min
  )
    return [
      `${prefix}${ref} lowers the bar below $30M best-case year-3 ARR at 2x growth.`,
    ];
  const problem = checkModel(model);
  return problem ? [`${prefix}${ref}: ${problem}`] : [];
}
