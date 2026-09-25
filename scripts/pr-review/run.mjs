// Advisory review run: plan → parallel discovery → independent verification
// → pr-review-receipt/v1. The transport is injected so tests never call a model.

import {
  assembleReceipt,
  planReview,
  rootCauseId,
  validateFinding,
} from '../lib/pr-review-contracts.mjs';
import { excerptForFinding, renderContext } from './context.mjs';
import { costUsd, REVIEW_ROUTES } from './models.mjs';
import { SPECIALISTS, VERIFIER } from './specialists.mjs';

export const DEFAULT_RUN_LIMITS = Object.freeze({
  budgetUsd: 0.5,
  maxCandidates: 12,
  concurrency: 4,
  discoveryMaxOutputTokens: 2_000,
  verificationMaxOutputTokens: 300,
});

/** Parse the first JSON object in model text; null when absent or malformed. */
export function parseJsonObject(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** Turn one raw model finding into a contract finding, or null when invalid. */
export function normalizeCandidate(raw, specialist, changedPaths) {
  if (!raw || typeof raw !== 'object') return null;
  const finding = {
    state: 'candidate',
    severity: raw.severity,
    evidenceLevel: 'excerpt',
    // Keyed by location, not specialist, so two specialists reporting the
    // same defect collapse into one finding.
    rootCauseId: rootCauseId({
      ruleId: raw.path,
      symbol: raw.symbol,
      consequenceClass: raw.consequenceClass,
    }),
    introducedByPr: raw.introducedByPr !== false,
    location: { path: raw.path, line: Number(raw.line) },
    specialist,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : '',
    title: raw.title,
    trigger: raw.trigger,
    consequence: raw.consequence,
    repair: raw.repair,
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.filter(item => typeof item === 'string').slice(0, 5)
      : [],
  };
  if (!changedPaths.has(finding.location.path)) return null;
  return validateFinding(finding).length === 0 ? finding : null;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(lanes);
  return results;
}

/**
 * @param {{
 *   pr: number, baseSha: string, headSha: string,
 *   riskRuleIds?: string[], advisedTier?: string,
 *   context: {files: {path: string, patch: string}[], importers: object[], truncated: string[], skipped?: string[]},
 *   transport: (call: {model: string, system: string, prompt: string, maxOutputTokens: number, signal?: AbortSignal}) => Promise<{text: string, usage?: object}>,
 *   prices: Record<string, {family: string, inPerMillion: number, outPerMillion: number}>,
 *   readLiveHead: () => Promise<string>,
 *   limits?: typeof DEFAULT_RUN_LIMITS,
 *   routes?: typeof REVIEW_ROUTES,
 *   signal?: AbortSignal,
 *   now?: () => string,
 * }} input
 */
export async function runReview({
  pr,
  baseSha,
  headSha,
  riskRuleIds = [],
  advisedTier = 'cheap',
  context,
  transport,
  prices,
  readLiveHead,
  limits = DEFAULT_RUN_LIMITS,
  routes = REVIEW_ROUTES,
  signal,
  now = () => new Date().toISOString(),
}) {
  const changedPaths = new Set(context.files.map(file => file.path));
  const testsChanged = [...changedPaths].some(path =>
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)
  );
  const plan = planReview({ riskRuleIds, advisedTier, testsChanged });
  const stats = { invalidCandidates: 0, droppedOverCap: 0, callErrors: 0 };
  let spent = 0;
  let failure = null;

  const finish = (liveHeadSha, findings, assessed, notAssessed) => ({
    ...assembleReceipt({
      pr,
      baseSha,
      headSha,
      liveHeadSha,
      findings,
      coverage: { assessed, notAssessed },
      failure,
      spend: { usd: Number(spent.toFixed(6)), capUsd: limits.budgetUsd },
      generatedAt: now(),
    }),
    plan,
    routes,
    stats,
  });

  const contextGaps = [
    ...context.truncated.map(path => `context:${path}`),
    ...plan.droppedSpecialists.map(name => `specialist:${name}`),
  ];
  if ((await readLiveHead()) !== headSha) {
    return finish('stale', [], [], plan.specialists.concat(contextGaps));
  }
  if (context.files.length === 0) {
    return finish(
      headSha,
      [],
      [],
      ['context:no-reviewable-files', ...contextGaps]
    );
  }

  const call = async (model, system, prompt, maxOutputTokens) => {
    if (spent >= limits.budgetUsd) {
      failure = 'budget-exhausted';
      return null;
    }
    try {
      const result = await transport({
        model,
        system,
        prompt,
        maxOutputTokens,
        signal,
      });
      spent += costUsd(prices, model, result.usage);
      return result.text;
    } catch {
      stats.callErrors += 1;
      failure = failure ?? 'provider-error';
      return null;
    }
  };

  const rendered = renderContext(context);
  const assessed = [];
  const notAssessed = [...contextGaps];
  const discovered = await mapLimit(
    plan.specialists,
    limits.concurrency,
    async specialist => {
      const text = await call(
        routes.discovery,
        SPECIALISTS[specialist],
        `Pull request #${pr}, base ${baseSha}, head ${headSha}.\n\n${rendered}`,
        limits.discoveryMaxOutputTokens
      );
      if (text === null) {
        notAssessed.push(`specialist:${specialist}`);
        return [];
      }
      const parsed = parseJsonObject(text);
      if (!parsed || !Array.isArray(parsed.findings)) {
        stats.invalidCandidates += 1;
        notAssessed.push(`specialist:${specialist}`);
        return [];
      }
      assessed.push(specialist);
      return parsed.findings.flatMap(raw => {
        const finding = normalizeCandidate(raw, specialist, changedPaths);
        if (!finding) stats.invalidCandidates += 1;
        return finding ? [finding] : [];
      });
    }
  );

  const seen = new Set();
  const candidates = discovered.flat().filter(finding => {
    if (seen.has(finding.rootCauseId)) return false;
    seen.add(finding.rootCauseId);
    return true;
  });
  const severityRank = { P0: 0, P1: 1, P2: 2 };
  candidates.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  );
  stats.droppedOverCap = Math.max(0, candidates.length - limits.maxCandidates);
  const kept = candidates.slice(0, limits.maxCandidates);

  const verified = await mapLimit(kept, limits.concurrency, async finding => {
    const excerpt = excerptForFinding(context, finding);
    const claim = JSON.stringify({
      path: finding.location.path,
      line: finding.location.line,
      title: finding.title,
      trigger: finding.trigger,
      consequence: finding.consequence,
    });
    const text = await call(
      routes.verification,
      VERIFIER,
      `Claim:\n${claim}\n\nSource excerpt:\n${excerpt}`,
      limits.verificationMaxOutputTokens
    );
    const verdict = parseJsonObject(text)?.verdict;
    if (verdict === 'supported') return { ...finding, state: 'verified' };
    if (verdict === 'contradicted') {
      return { ...finding, state: 'dismissed-with-evidence' };
    }
    return finding;
  });

  return finish(await readLiveHead(), verified, assessed, notAssessed);
}
