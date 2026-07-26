/**
 * Deterministic issue classification for backlog orchestrator.
 *
 * Determines classification, relationships, and eligibility using
 * cheap field-level checks first. Model calls only for semantic ambiguity.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Classification result for a single issue.
 */
export class IssueClassification {
  constructor(issue) {
    this.identifier = issue.identifier;
    this.title = issue.title;
    this.state = issue.state?.name;
    this.fingerprint = this.#computeFingerprint(issue);
    this.category = null; // canonical | duplicate | superseded | obsolete | blocked | triageable
    this.mrrCategory = null; // acquisition | activation | paid | retention | expansion | revenue-protection | throughput | reliability | unknown
    this.mrrConfidence = null; // high | medium | low
    this.effort = null; // trivial | small | medium | large | unknown
    this.risk = null; // low | medium | high
    this.valueScore = null; // 0-100 relative score
    this.area = null; // product/code area (extracted from labels/title)
    this.evidence = []; // strings explaining decisions
    this.relatedIssues = []; // [{ identifier, relation: 'duplicate'|'supersedes'|'related'|'blockedBy' }]
    this.workstreamId = null; // if bundled → the target workstream identifier
    this.preexisting = null; // previously stored classification (if available)
    this.needsModel = false; // whether semantic analysis is needed
  }

  #computeFingerprint(issue) {
    const canonical = [
      issue.identifier,
      issue.title?.trim() || '',
      (issue.description || '').trim().slice(0, 200),
      issue.state?.name || '',
      issue.labels?.nodes
        ?.map(l => l.name)
        .sort()
        .join(',') || '',
      issue.updatedAt,
    ].join('|');
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }
}

/**
 * Deterministic classifiers — run first, no model calls.
 */

const LABEL_TO_AREA = {
  'area:app-router': 'app-router',
  'area:ui': 'ui',
  'area:core-flows': 'core-flows',
  'area:ops': 'ops',
  'area:infra': 'infrastructure',
  'area:design': 'design',
};

const TITLE_AREA_PATTERNS = [
  [/^perf/i, 'performance'],
  [/^test/i, 'testing'],
  [/^ci/i, 'ci'],
  [/^docs?/i, 'docs'],
  [/^feat/i, 'feature'],
  [/^fix/i, 'bugfix'],
  [/^refactor/i, 'refactor'],
  [/^chore/i, 'chore'],
];

function extractArea(issue) {
  for (const label of issue.labels?.nodes || []) {
    const area = LABEL_TO_AREA[label.name];
    if (area) return area;
  }
  for (const [pattern, area] of TITLE_AREA_PATTERNS) {
    if (pattern.test(issue.title)) return area;
  }
  return 'unknown';
}

const LABEL_TO_MRR = {
  'category:ui-ux': 'activation',
  acquisition: 'acquisition',
  activation: 'activation',
  'launch-blocker': 'revenue-protection',
  security: 'revenue-protection',
  billing: 'paid',
  a11y: 'activation',
  performance: 'retention',
  'qa:perf': 'retention',
};

const TITLE_MRR_PATTERNS = [
  [/sign.?up|register|onboard/i, 'activation'],
  [/login|auth|oauth|sign.?in/i, 'activation'],
  [/payment|billing|subscribe|plan|price/i, 'paid'],
  [/revenue|mrr|monetize/i, 'expansion'],
  [/crash|bug|error|500|fail/i, 'reliability'],
  [/perf|slow|latency|timeout/i, 'retention'],
  [/ci|deploy|ship|release|pipeline/i, 'throughput'],
];

function classifyMrr(issue) {
  for (const label of issue.labels?.nodes || []) {
    const mrr = LABEL_TO_MRR[label.name];
    if (mrr)
      return {
        category: mrr,
        confidence: 'medium',
        evidence: `label: ${label.name}`,
      };
  }
  for (const [pattern, mrr] of TITLE_MRR_PATTERNS) {
    if (pattern.test(issue.title)) {
      return {
        category: mrr,
        confidence: 'high',
        evidence: `title match: ${pattern.source}`,
      };
    }
  }
  return {
    category: 'unknown',
    confidence: 'low',
    evidence: 'no clear MRR signal',
  };
}

function classifyEffort(issue) {
  if (issue.estimate != null) {
    if (issue.estimate <= 1)
      return { effort: 'trivial', evidence: `estimate=${issue.estimate}` };
    if (issue.estimate <= 3)
      return { effort: 'small', evidence: `estimate=${issue.estimate}` };
    if (issue.estimate <= 8)
      return { effort: 'medium', evidence: `estimate=${issue.estimate}` };
    return { effort: 'large', evidence: `estimate=${issue.estimate}` };
  }
  // Heuristic from description length
  const descLen = (issue.description || '').length;
  if (descLen < 100)
    return { effort: 'trivial', evidence: 'short description' };
  if (descLen < 500)
    return { effort: 'small', evidence: 'moderate description' };
  if (descLen < 2000)
    return { effort: 'medium', evidence: 'detailed description' };
  return { effort: 'large', evidence: 'very detailed description' };
}

/**
 * Detect exact duplicates by matching identifiers in issue relations.
 */
function findExactDuplicates(issue, allIssues) {
  const dupes = [];
  for (const rel of issue.relations?.nodes || []) {
    if (rel.type === 'duplicate' || rel.type === 'duplicate_of') {
      dupes.push({
        identifier: rel.relatedIssue.identifier,
        relation: 'duplicate',
      });
    }
  }
  return dupes;
}

/**
 * Detect supersession: check if a newer issue exists on the same area with higher priority.
 */
function findSuperseded(issue, allIssues) {
  const area = extractArea(issue);
  const supersededBy = allIssues.filter(other => {
    if (other.identifier === issue.identifier) return false;
    if (other.state?.name === 'Canceled' || other.state?.name === 'Done')
      return false;
    const otherArea = extractArea(other);
    if (otherArea !== area) return false;
    const issueDate = new Date(issue.createdAt).getTime();
    const otherDate = new Date(other.createdAt).getTime();
    return (
      otherDate > issueDate && (other.priority || 0) > (issue.priority || 0)
    );
  });
  return supersededBy.map(s => ({
    identifier: s.identifier,
    relation: 'superseded_by',
  }));
}

/**
 * Detect if already satisfied by checking if issue title/description mentions
 * a feature that is marked Done.
 */
function findObsolete(issue, allIssues) {
  const keyTerms = extractKeyTerms(
    issue.title + ' ' + (issue.description || '')
  );
  const matches = allIssues.filter(other => {
    if (other.identifier === issue.identifier) return false;
    if (other.state?.name !== 'Done') return false;
    const otherTerms = extractKeyTerms(
      other.title + ' ' + (other.description || '')
    );
    return keyTerms.some(t => otherTerms.includes(t));
  });
  return matches.map(m => ({
    identifier: m.identifier,
    relation: 'superseded_by',
  }));
}

function extractKeyTerms(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(
      w =>
        w.length > 4 &&
        !['this', 'that', 'with', 'from', 'have', 'been', 'were'].includes(w)
    );
}

/**
 * Detect if issue description references a URL that matches another issue's described area.
 */
function findRelatedByUrl(issue, allIssues) {
  const urls = extractUrls(issue.description || '');
  if (urls.length === 0) return [];

  return allIssues
    .filter(other => {
      if (other.identifier === issue.identifier) return false;
      const otherUrls = extractUrls(other.description || '');
      return urls.some(u => otherUrls.includes(u));
    })
    .map(m => ({ identifier: m.identifier, relation: 'related' }));
}

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s,)]+/g;
  return [...new Set(text.match(urlRegex) || [])];
}

/**
 * Run all deterministic classifiers.
 */
export function classifyDeterministic(issue, allIssues) {
  const c = new IssueClassification(issue);
  c.area = extractArea(issue);

  const mrr = classifyMrr(issue);
  c.mrrCategory = mrr.category;
  c.mrrConfidence = mrr.confidence;
  c.evidence.push(mrr.evidence);

  const effort = classifyEffort(issue);
  c.effort = effort.effort;
  c.evidence.push(effort.evidence);

  // Duplicates
  const dupes = findExactDuplicates(issue, allIssues);
  if (dupes.length > 0) {
    c.category = 'duplicate';
    c.relatedIssues.push(...dupes);
    c.evidence.push(
      `exact duplicate of: ${dupes.map(d => d.identifier).join(', ')}`
    );
  }

  // Supersession
  const superseded = findSuperseded(issue, allIssues);
  if (superseded.length > 0) {
    c.category = 'superseded';
    c.relatedIssues.push(...superseded);
    c.evidence.push(
      `superseded by: ${superseded.map(s => s.identifier).join(', ')}`
    );
  }

  // Obsolete (already Done)
  const obsolete = findObsolete(issue, allIssues);
  if (obsolete.length > 0) {
    if (!c.category) c.category = 'obsolete';
    c.relatedIssues.push(...obsolete);
    c.evidence.push(
      `obsolete — already satisfied by: ${obsolete.map(o => o.identifier).join(', ')}`
    );
  }

  // Related by URL
  const urlRelated = findRelatedByUrl(issue, allIssues);
  if (urlRelated.length > 0) {
    c.relatedIssues.push(
      ...urlRelated.map(r => ({ ...r, relation: 'related' }))
    );
    c.evidence.push(
      `shares URLs with: ${urlRelated.map(r => r.identifier).join(', ')}`
    );
  }

  // Default
  if (!c.category) {
    c.category = 'triageable';
  }

  // Compute relative value score
  c.valueScore = computeValueScore(c);
  c.risk = computeRisk(c);

  return c;
}

const MRR_VALUE_WEIGHTS = {
  'revenue-protection': 90,
  reliability: 60,
  throughput: 40,
  paid: 70,
  activation: 50,
  acquisition: 30,
  retention: 50,
  expansion: 40,
  unknown: 10,
};

const EFFORT_PENALTY = {
  trivial: 0,
  small: 10,
  medium: 30,
  large: 50,
  unknown: 20,
};

function computeValueScore(c) {
  const base = MRR_VALUE_WEIGHTS[c.mrrCategory] || 10;
  const effort = EFFORT_PENALTY[c.effort] || 20;
  const confidenceBonus =
    c.mrrConfidence === 'high' ? 15 : c.mrrConfidence === 'medium' ? 5 : 0;
  return Math.max(0, Math.min(100, base - effort + confidenceBonus));
}

function computeRisk(c) {
  if (c.effort === 'large' && c.mrrCategory === 'revenue-protection')
    return 'high';
  if (c.effort === 'large') return 'medium';
  return 'low';
}

/**
 * Read/replay previously stored classification from a machine-owned comment.
 */
export function parseStoredClassification(issue) {
  const machineComments = (issue.comments?.nodes || []).filter(c =>
    c.body.startsWith('<!-- backlog-orchestrator:v1 -->')
  );
  if (machineComments.length === 0) return null;
  const latest = machineComments.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )[0];
  try {
    const jsonPart = latest.body
      .split('<!--/backlog-orchestrator-->')[0]
      ?.split('-->')[1]
      ?.trim();
    return jsonPart ? JSON.parse(jsonPart) : null;
  } catch {
    return null;
  }
}

/**
 * Build the classification comment body for persisting to Linear.
 */
export function buildStoredClassification(c) {
  const payload = {
    v: 1,
    fp: c.fingerprint,
    cat: c.category,
    mrrCat: c.mrrCategory,
    mrrConf: c.mrrConfidence,
    effort: c.effort,
    risk: c.risk,
    score: c.valueScore,
    area: c.area,
    ws: c.workstreamId,
    rels: c.relatedIssues,
  };
  return `<!-- backlog-orchestrator:v1 -->\n${JSON.stringify(payload, null, 2)}\n<!--/backlog-orchestrator-->`;
}
