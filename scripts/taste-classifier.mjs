/**
 * Taste-call classifier for Jovie's autonomous shipping system.
 *
 * Analyzes a PR diff + metadata to determine whether it needs stronger
 * LLM review (taste/UX/copy/design judgment) vs. can be auto-shipped.
 *
 * Usage:
 *   node scripts/taste-classifier.mjs --pr <number> [--dry-run] [--json]
 *
 * Exit codes:
 *   0 = classified successfully
 *   2 = classification uncertain (defaults to llm-reviewable — the taste
 *       gate only applies on a positive material-UX signal, JOV-3592)
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  conventionalCommitType,
  hasMaterialUxMarker,
  MATERIAL_UX_MARKER,
  NON_TASTE_COMMIT_TYPES,
} from './lib/taste-label-guard.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

// Ensure gh CLI has a token (GitHub Actions provides GITHUB_TOKEN automatically)
if (!process.env.GH_TOKEN && process.env.GITHUB_TOKEN) {
  process.env.GH_TOKEN = process.env.GITHUB_TOKEN;
}

// ---------------------------------------------------------------------------
// Taste signal patterns
// ---------------------------------------------------------------------------

/** File paths that strongly indicate a taste call is needed */
const TASTE_FILE_PATTERNS = [
  // Design system
  /design\.tokens\.(ts|js|json)$/i,
  /tailwind\.config\.(ts|js)$/i,
  /globals\.css$/i,
  /theme\.(ts|css)$/i,
  /\.tokens\./i,
  // Public/marketing pages
  /apps\/web\/app\/\(home\)\//i,
  /apps\/web\/app\/\(marketing\)\//i,
  /apps\/web\/app\/\(\[username\]\)\//i,
  /apps\/web\/app\/about\//i,
  /apps\/web\/app\/pricing\//i,
  // Design doc
  /DESIGN\.md$/i,
  // User-facing copy
  /apps\/web\/lib\/(email|emails)\//i,
  /apps\/web\/components\/.*\/(hero|banner|landing|marketing)\//i,
  // Onboarding
  /apps\/web\/app\/(onboarding|signup|signin)\//i,
  /apps\/web\/components\/.*onboarding/i,
];

/** File paths that indicate NO taste needed (backend/infra) */
const NON_TASTE_FILE_PATTERNS = [
  /apps\/web\/drizzle\//i,
  /apps\/web\/lib\/db\//i,
  /apps\/web\/app\/api\//i,
  /apps\/web\/middleware\.ts$/i,
  /apps\/web\/proxy\.ts$/i,
  /\.github\/workflows\//i,
  /scripts\//i,
  /tests?\//i,
  /\.test\.(ts|tsx|js)$/i,
  /\.spec\.(ts|tsx|js)$/i,
  /drizzle\.config\./i,
  /\.sql$/i,
  /pnpm-lock\.yaml$/i,
  /package\.json$/i,
  /turbo\.json$/i,
  /next\.config\./i,
  /biome\.json$/i,
  /tsconfig.*\.json$/i,
];

/** PR body keywords that signal taste */
const TASTE_BODY_KEYWORDS = [
  /\bdesign\b/i,
  /\bUX\b/,
  /\blooks?\b/i,
  /\bfeel\b/i,
  /\btypograph(y|ic)\b/i,
  /\bspacing\b/i,
  /\bcompos(ition|e)\b/i,
  /\bhero\b/i,
  /\bbanner\b/i,
  /\blanding\b/i,
  /\bstyle\b/i,
  /\btheme\b/i,
  /\bwireframe\b/i,
  /\bmockup\b/i,
  /\bprototype\b/i,
  /\bscreenshot\b/i,
  /\bbefore.{0,10}after\b/i,
];

/** Phrases that negate taste signals (e.g. "no taste gate") */
const TASTE_NEGATION_PATTERNS = [
  /\bno\s+taste\b/i,
  /\bno\s+design\s+(review|gate)\b/i,
  /\btaste\s+(gate|review)\s+(not\s+)?(needed|required)\b/i,
];

/** PR body keywords that signal NO taste (mechanical/technical) */
const NON_TASTE_BODY_KEYWORDS = [
  /\bbug\b/i,
  /\bfix(es|ed|ing)?\b/i,
  /\brefactor\b/i,
  /\btest(s|ing)?\b/i,
  /\btype(s|cript)?\b/i,
  /\blint\b/i,
  /\bci\b/i,
  /\bperf\b/i,
  /\bperformance\b/i,
  /\bsecur(e|ity)\b/i,
  /\ba11y\b/i,
  /\baccessib(ility|le)\b/i,
  /\bquarantine\b/i,
  /\bflak(e|y)\b/i,
  /\bregression\b/i,
  /\bhotfix\b/i,
  /\btypo\b/i,
  /\bcomment\b/i,
  /\bcleanup\b/i,
  /\bchore\b/i,
  /\bcompliance\b/i,
  /\btoken\s*(change|update|rule)?\b/i,
  /\bno\s+taste\s+gate\b/i,
];

/**
 * Labels that force a classification. Deliberately does NOT include
 * `needs-human-taste` — that is this classifier's own OUTPUT, and treating it
 * as an input made every prior classification sticky forever (JOV-3808).
 */
const FORCE_TASTE_LABELS = ['design', 'ui', 'ux'];

/**
 * Terminal label from the former taste-approve workflow (removed 2026-07-07).
 * Kept for backward compatibility: if a reopened PR still carries this label,
 * the classifier treats it as auto-ship and never re-gates.
 */
const TASTE_APPROVED_LABEL = 'taste-approved';

const FORCE_NON_TASTE_LABELS = ['dependencies', 'automated', 'bot', 'ci-infra'];

const AUTO_SHIP_LABELS = ['auto-ship', 'bot-clean'];

// ---------------------------------------------------------------------------
// Classification engine
// ---------------------------------------------------------------------------

export function classifyTaste(pr) {
  const {
    title = '',
    body = '',
    files = [],
    labels = [],
    author = '',
    isDependabot = false,
    additions = 0,
    deletions = 0,
  } = pr;

  // --- Hard rules (never overridden) ---

  // Dependabot with small diff → auto-ship
  if (isDependabot || author === 'dependabot[bot]') {
    return {
      classification: 'auto-ship',
      confidence: 0.95,
      reason: 'Dependabot automated dependency bump',
      signals: ['author:dependabot'],
    };
  }

  const labelNames = labels.map(l => (typeof l === 'string' ? l : l.name));

  // Terminal human decision — a prior /approve is never re-litigated.
  if (labelNames.includes(TASTE_APPROVED_LABEL)) {
    return {
      classification: 'auto-ship',
      confidence: 1,
      reason:
        'Taste already approved by a human (taste-approved label) — never re-gated',
      signals: [`label:${TASTE_APPROVED_LABEL}`],
    };
  }

  // Force labels override everything
  if (FORCE_TASTE_LABELS.some(l => labelNames.includes(l))) {
    return {
      classification: 'taste-required',
      confidence: 0.99,
      reason: `Force-labeled: ${FORCE_TASTE_LABELS.filter(l => labelNames.includes(l)).join(', ')}`,
      signals: labelNames
        .filter(l => FORCE_TASTE_LABELS.includes(l))
        .map(l => `label:${l}`),
    };
  }
  if (FORCE_NON_TASTE_LABELS.some(l => labelNames.includes(l))) {
    return {
      classification: 'llm-reviewable',
      confidence: 0.95,
      reason: `Force-labeled (non-taste): ${FORCE_NON_TASTE_LABELS.filter(l => labelNames.includes(l)).join(', ')}`,
      signals: labelNames
        .filter(l => FORCE_NON_TASTE_LABELS.includes(l))
        .map(l => `label:${l}`),
    };
  }
  if (AUTO_SHIP_LABELS.some(l => labelNames.includes(l))) {
    return {
      classification: 'auto-ship',
      confidence: 0.95,
      reason: `Force-labeled: ${AUTO_SHIP_LABELS.filter(l => labelNames.includes(l)).join(', ')}`,
      signals: labelNames
        .filter(l => AUTO_SHIP_LABELS.includes(l))
        .map(l => `label:${l}`),
    };
  }

  // Non-taste conventional-commit types are never taste calls on their own
  // (Tim's 2026-06-26 directive; same policy as lib/taste-label-guard.mjs).
  // A fix/chore/refactor/etc. PR only gets the gate with an explicit
  // `ux:material` marker — this is how PR #12688 (a fix) got mis-gated.
  const commitType = conventionalCommitType(title);
  if (
    commitType &&
    NON_TASTE_COMMIT_TYPES.has(commitType) &&
    !hasMaterialUxMarker(labelNames)
  ) {
    return {
      classification: 'llm-reviewable',
      confidence: 0.9,
      reason: `\`${commitType}\` changes are not taste calls — add \`${MATERIAL_UX_MARKER}\` if this PR makes a material UX change`,
      signals: [`commit-type:${commitType}`],
    };
  }

  // --- Score-based classification ---

  const signals = [];
  let tasteScore = 0;
  let nonTasteScore = 0;

  // 1. File path analysis
  let tasteFiles = 0;
  let nonTasteFiles = 0;
  let neutralFiles = 0;

  for (const file of files) {
    const isTaste = TASTE_FILE_PATTERNS.some(p => p.test(file));
    const isNonTaste = NON_TASTE_FILE_PATTERNS.some(p => p.test(file));

    if (isTaste) {
      tasteFiles++;
      signals.push(`taste-file:${file}`);
    } else if (isNonTaste) {
      nonTasteFiles++;
      signals.push(`non-taste-file:${file}`);
    } else {
      neutralFiles++;
    }
  }

  // Weight: taste files are strong signals
  if (files.length > 0) {
    const tasteRatio = tasteFiles / files.length;
    const nonTasteRatio = nonTasteFiles / files.length;

    if (tasteRatio > 0.3) {
      tasteScore += 3 * tasteRatio;
    }
    if (nonTasteRatio > 0.7) {
      nonTasteScore += 2 * nonTasteRatio;
    }
  }

  // 2. PR body analysis

  // Screenshot in body = strong taste signal
  if (
    /!\[[^\]]*\]\(|<img |user-images\.githubusercontent|github\.com\/user-attachments/.test(
      body
    )
  ) {
    tasteScore += 4;
    signals.push('body:has-screenshot');
  }

  // Negation patterns: phrases like "no taste gate" cancel taste signals
  let tasteNegated = false;
  for (const neg of TASTE_NEGATION_PATTERNS) {
    if (neg.test(body)) {
      tasteNegated = true;
      signals.push(`body:negation:${neg.source.replace(/[^a-z]/gi, '')}`);
      break;
    }
  }

  // Body keywords
  if (!tasteNegated) {
    for (const kw of TASTE_BODY_KEYWORDS) {
      if (kw.test(body)) {
        tasteScore += 1;
        signals.push(`body:keyword:${kw.source.replace(/[^a-z]/gi, '')}`);
      }
    }
  }
  for (const kw of NON_TASTE_BODY_KEYWORDS) {
    if (kw.test(body)) {
      nonTasteScore += 0.5;
      signals.push(`body:keyword:${kw.source.replace(/[^a-z]/gi, '')}`);
    }
  }

  // 3. Title analysis
  const titleTasteWords = [
    /design/i,
    /ui/i,
    /ux/i,
    /visual/i,
    /layout/i,
    /style/i,
    /theme/i,
    /brand/i,
    /hero/i,
    /landing/i,
  ];
  const titleNonTasteWords = [
    /fix/i,
    /test/i,
    /refactor/i,
    /lint/i,
    /type/i,
    /chore/i,
    /bump/i,
    /deps?/i,
    /ci/i,
    /perf/i,
    /a11y/i,
    /bug/i,
    /copy/i,
  ];

  for (const w of titleTasteWords) {
    if (w.test(title)) {
      tasteScore += 1.5;
      signals.push(`title:${w.source}`);
    }
  }
  for (const w of titleNonTasteWords) {
    if (w.test(title)) {
      nonTasteScore += 1;
      signals.push(`title:${w.source}`);
    }
  }

  // 4. Diff size heuristic
  const totalChanges = additions + deletions;
  if (totalChanges < 10 && nonTasteFiles > 0) {
    nonTasteScore += 1; // tiny backend change
    signals.push('diff:tiny');
  }
  if (totalChanges > 200 && tasteFiles > 0) {
    tasteScore += 1; // large UI change
    signals.push('diff:large-with-taste');
  }

  // --- Decision ---

  if (tasteScore >= 3) {
    return {
      classification: 'taste-required',
      confidence: Math.min(0.95, 0.6 + tasteScore * 0.05),
      reason: `Taste signals dominate (score: +${tasteScore.toFixed(1)} vs -${nonTasteScore.toFixed(1)})`,
      signals: signals.slice(0, 10),
      stats: {
        tasteFiles,
        nonTasteFiles,
        neutralFiles,
        tasteScore,
        nonTasteScore,
      },
    };
  }

  if (nonTasteScore >= 2 && tasteScore < 1) {
    return {
      classification: 'llm-reviewable',
      confidence: Math.min(0.9, 0.5 + nonTasteScore * 0.1),
      reason: `Technical change, no taste signals (score: +${tasteScore.toFixed(1)} vs -${nonTasteScore.toFixed(1)})`,
      signals: signals.slice(0, 10),
      stats: {
        tasteFiles,
        nonTasteFiles,
        neutralFiles,
        tasteScore,
        nonTasteScore,
      },
    };
  }

  if (nonTasteScore >= 1 && tasteScore === 0 && totalChanges < 50) {
    return {
      classification: 'auto-ship',
      confidence: 0.7,
      reason: `Small mechanical change, zero taste signals`,
      signals: signals.slice(0, 5),
      stats: {
        tasteFiles,
        nonTasteFiles,
        neutralFiles,
        tasteScore,
        nonTasteScore,
      },
    };
  }

  // Uncertain → default to llm-reviewable, NOT taste-required. Standing owner
  // rule (2026-06-26, JOV-3592): the taste label applies ONLY on a positive
  // material-UX-change signal; uncertain/non-visual work must auto-flow to
  // strong LLM review. Defaulting uncertain to taste-required grew the human
  // gate to 51% of bot PRs (#13348). Flipped-by-default cases carry a
  // `default:flipped-to-llm-reviewable` signal for the weekly audit.
  signals.push('default:flipped-to-llm-reviewable');
  return {
    classification: 'llm-reviewable',
    confidence: 0.5,
    reason: `Uncertain classification (score: +${tasteScore.toFixed(1)} vs -${nonTasteScore.toFixed(1)}) — no positive taste signal, defaulting to llm-reviewable (JOV-3592; logged for weekly audit)`,
    signals: signals.slice(0, 10),
    stats: {
      tasteFiles,
      nonTasteFiles,
      neutralFiles,
      tasteScore,
      nonTasteScore,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const prIndex = args.indexOf('--pr');
  const dryRun = args.includes('--dry-run');
  const jsonOutput = args.includes('--json');

  if (prIndex === -1 || !args[prIndex + 1]) {
    console.log(`Taste-call classifier for Jovie

Usage:
  node scripts/taste-classifier.mjs --pr <number> [--dry-run] [--json]

Options:
  --pr <number>   PR number to classify
  --dry-run       Don't apply labels or comments
  --json          Output raw JSON classification

Classifications:
  taste-required  → llm-review label; ships autonomously, humans review post-ship in prod walkthroughs (2026-07-06 full-autonomy policy)
  llm-reviewable  → trigger stronger LLM review, no human gate
  auto-ship       → add merge-queue label, ship it
`);
    process.exit(0);
  }

  const prNumber = args[prIndex + 1];

  // Fetch PR data from GitHub
  let prData;
  try {
    const result = await exec(
      `gh pr view ${prNumber} --json number,title,body,files,author,labels,additions,deletions,headRefName`
    );
    prData = JSON.parse(result);
  } catch (err) {
    console.error(`Failed to fetch PR #${prNumber}: ${err.message}`);
    process.exit(1);
  }

  const pr = {
    number: prData.number,
    title: prData.title,
    body: prData.body || '',
    files: prData.files?.map(f => f.path) || [],
    author: prData.author?.login || '',
    labels: prData.labels || [],
    additions: prData.additions || 0,
    deletions: prData.deletions || 0,
    isDependabot: prData.author?.login === 'dependabot[bot]',
  };

  const classification = classifyTaste(pr);

  if (jsonOutput) {
    console.log(JSON.stringify({ pr: prNumber, ...classification }, null, 2));
    process.exit(0);
  }

  console.log(`PR #${prNumber}: "${pr.title}"`);
  console.log(`Classification: ${classification.classification}`);
  console.log(`Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
  console.log(`Reason: ${classification.reason}`);
  if (classification.signals?.length > 0) {
    console.log(`Signals: ${classification.signals.join(', ')}`);
  }

  if (!dryRun) {
    // Apply label
    const labelMap = {
      'taste-required': 'llm-review',
      'llm-reviewable': 'llm-review',
      'auto-ship': 'merge-queue',
    };
    const label = labelMap[classification.classification];
    if (label) {
      try {
        await exec(`gh pr edit ${prNumber} --add-label "${label}"`);
        console.log(`Applied label: ${label}`);
      } catch (err) {
        console.error(`Failed to apply label: ${err.message}`);
      }
    }

    // Post comment
    const comment = buildComment(classification, prNumber);
    try {
      await exec(`gh pr comment ${prNumber} --body ${JSON.stringify(comment)}`);
      console.log('Posted classification comment');
    } catch (err) {
      console.error(`Failed to post comment: ${err.message}`);
    }
  } else {
    const labelMap = {
      'taste-required': 'llm-review',
      'llm-reviewable': 'llm-review',
      'auto-ship': 'merge-queue',
    };
    console.log(
      '[dry-run] Would apply label:',
      labelMap[classification.classification]
    );
  }
}

function buildComment(classification, prNumber) {
  const emoji = {
    'taste-required': '🎨',
    'llm-reviewable': '🤖',
    'auto-ship': '🚀',
  };

  let comment = `## ${emoji[classification.classification] || '🔍'} Taste Classifier: \`${classification.classification}\`\n\n`;
  comment += `**Confidence:** ${(classification.confidence * 100).toFixed(0)}%\n`;
  comment += `**Reason:** ${classification.reason}\n\n`;

  if (classification.signals?.length > 0) {
    comment += `**Key signals:**\n`;
    for (const sig of classification.signals.slice(0, 8)) {
      comment += `- \`${sig}\`\n`;
    }
    comment += '\n';
  }

  if (classification.classification === 'taste-required') {
    comment +=
      '> 🎨 This PR has been flagged for taste review. Strong LLM review will validate it pre-merge; review the output in a prod walkthrough post-ship.\n';
  } else if (classification.classification === 'llm-reviewable') {
    comment +=
      '> ✅ No taste gate needed. Strong LLM review will validate correctness.\n';
  } else {
    comment += '> 🚀 Auto-ship eligible. Will merge once CI is green.\n';
  }

  comment += '\n*— Taste classifier v1.0 (autonomous shipping system)*';

  return comment;
}

function exec(cmd) {
  return new Promise((resolve, reject) => {
    try {
      const output = execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT });
      resolve(output.trim());
    } catch (err) {
      reject(new Error(err.stderr?.toString() || err.message));
    }
  });
}

// Only run CLI if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
