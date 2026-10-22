// Release-range risk grading (extends JOV-5937 release-risk-policy).
//
// Risk is graded over the COMPLETE range deployedSha..candidateSha, never the
// newest commit alone. Every changed path is classified by the CI harness risk
// rules; a path that matches no risk rule must also match an explicit
// known-safe pattern, otherwise it is `unknown`. Unknown never grades low.
//
// Artifact schema `jovie.release-range-risk/v1`:
//   {
//     schema, baseDeployedSha, candidateSha,
//     unknown: boolean,            // any unclassifiable path, missing base SHA/paths, or error
//     unknownReasons: string[],
//     level: 'low'|'medium'|'high', // unknown => high
//     paths: [{ path, class, level }],   // class = risk rule id | 'safe' | 'unknown'
//     affects: { auth, billing, database, config, proxy, automation, ci, agent, publicUi, unknown },
//     matchedRuleIds: string[], requiresSmoke, requiresPreview, blocksUnattended
//   }
import { classifyCiRisk, loadCiHarnessManifest } from './ci-harness.mjs';

export const RANGE_RISK_SCHEMA = 'jovie.release-range-risk/v1';
const RANK = { low: 0, medium: 1, high: 2 };
const SHA = /^[0-9a-f]{40}$/;

/** Paths that cannot change what the deployed web app or its config does. */
const KNOWN_SAFE = [
  /\.mdx?$/i,
  /^docs\//,
  /^LICENSE/,
  /(^|\/)(__tests__|__mocks__|tests?|e2e|fixtures|stories)\//,
  /\.(test|spec|stories)\.[cm]?[jt]sx?$/,
  /^apps\/(ios|mac|desktop|extension)\//,
  /^scripts\//,
  /^apps\/web\/components\//,
  /^apps\/web\/app\/(?!api\/)/,
  /^apps\/web\/public\//,
  /^apps\/web\/(hooks|types|constants)\//,
];

const AFFECTS = {
  'auth-identity': 'auth',
  'billing-money': 'billing',
  'db-migrations': 'database',
  'env-config': 'config',
  'proxy-middleware': 'proxy',
  'activation-automation-data': 'automation',
  'ci-workflows': 'ci',
  'agent-control-plane': 'agent',
  'public-ui': 'publicUi',
};

const emptyAffects = () => ({
  auth: false,
  billing: false,
  database: false,
  config: false,
  proxy: false,
  automation: false,
  ci: false,
  agent: false,
  publicUi: false,
  unknown: false,
});

function failClosed(baseDeployedSha, candidateSha, reasons, paths = []) {
  const affects = emptyAffects();
  affects.unknown = true;
  return {
    schema: RANGE_RISK_SCHEMA,
    baseDeployedSha: baseDeployedSha ?? null,
    candidateSha: candidateSha ?? null,
    unknown: true,
    unknownReasons: reasons,
    level: 'high',
    paths,
    affects,
    matchedRuleIds: [],
    requiresSmoke: true,
    requiresPreview: true,
    blocksUnattended: false,
  };
}

/**
 * @param {{
 *   baseDeployedSha?: string | null,
 *   candidateSha?: string | null,
 *   paths?: string[] | null,
 *   manifest?: any,
 * }} input
 */
export function gradeReleaseRange({
  baseDeployedSha,
  candidateSha,
  paths,
  manifest,
}) {
  try {
    const reasons = [];
    if (!SHA.test(baseDeployedSha ?? '')) reasons.push('missing deployed SHA');
    if (!SHA.test(candidateSha ?? '')) reasons.push('missing candidate SHA');
    if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string'))
      reasons.push('changed-path list unavailable');
    if (reasons.length)
      return failClosed(baseDeployedSha, candidateSha, reasons);

    const rules = manifest ?? loadCiHarnessManifest();
    const unique = [...new Set(paths)].sort();
    const affects = emptyAffects();
    const matched = new Set();
    let level = 'low';
    let requiresSmoke = false;
    let requiresPreview = false;
    let blocksUnattended = false;
    const classified = unique.map(path => {
      const result = classifyCiRisk([path], rules);
      if (result.errors.length) throw new Error(result.errors.join('; '));
      if (result.matchedRules.length) {
        const top = result.matchedRules.reduce((a, b) =>
          RANK[b.level] > RANK[a.level] ? b : a
        );
        for (const rule of result.matchedRules) {
          matched.add(rule.id);
          if (AFFECTS[rule.id]) affects[AFFECTS[rule.id]] = true;
        }
        if (RANK[result.riskLevel] > RANK[level]) level = result.riskLevel;
        requiresSmoke ||= result.requiresSmoke;
        requiresPreview ||= result.requiresPreview;
        blocksUnattended ||= result.blocksUnattendedAutoMerge;
        return { path, class: top.id, level: result.riskLevel };
      }
      if (KNOWN_SAFE.some(re => re.test(path)))
        return { path, class: 'safe', level: 'low' };
      affects.unknown = true;
      return { path, class: 'unknown', level: 'high' };
    });
    const unknownPaths = classified.filter(p => p.class === 'unknown');
    const unknown = unknownPaths.length > 0;
    if (unknown) {
      level = 'high';
      requiresSmoke = true;
      requiresPreview = true;
    }
    return {
      schema: RANGE_RISK_SCHEMA,
      baseDeployedSha,
      candidateSha,
      unknown,
      unknownReasons: unknownPaths.map(p => `unclassified path ${p.path}`),
      level,
      paths: classified,
      affects,
      matchedRuleIds: [...matched].sort(),
      requiresSmoke,
      requiresPreview,
      blocksUnattended,
    };
  } catch (error) {
    return failClosed(baseDeployedSha, candidateSha, [
      `classification error: ${error.message}`,
    ]);
  }
}

export const maxLevel = (a, b) => (RANK[b] > RANK[a] ? b : a);
