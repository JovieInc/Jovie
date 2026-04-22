import {
  type ApplicabilityPredicate,
  compileRule,
  parseApplicabilityRule,
  type ReleaseContext,
} from './applicability';

export type CatalogRow = {
  slug: string;
  name: string;
  category: string;
  clusterId: number | null;
  shortDescription: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  flowStageDaysOffset: number | null;
  applicabilityRules: unknown;
  aiSkillStatus: 'none' | 'planned' | 'in_progress' | 'shipped';
  aiSkillId: string | null;
  assigneeType: 'human' | 'ai_workflow';
  catalogVersion: number;
};

export type SelectionResult = {
  slug: string;
  score: number;
  reasons: string[];
};

const PRIORITY_SCORE: Record<CatalogRow['priority'], number> = {
  urgent: 100,
  high: 75,
  medium: 50,
  low: 25,
  none: 10,
};

export function selectTasks(
  ctx: ReleaseContext,
  catalog: CatalogRow[]
): SelectionResult[] {
  const results: SelectionResult[] = [];

  for (const row of catalog) {
    let predicate: ApplicabilityPredicate;
    try {
      predicate = parseApplicabilityRule(row.applicabilityRules);
    } catch {
      continue;
    }

    const evaluation = compileRule(predicate)(ctx);
    if (!evaluation.matched) continue;

    const baseScore = PRIORITY_SCORE[row.priority] ?? 0;
    const reasonBonus = Math.min(evaluation.reasons.length, 5);
    const shippedBonus = row.aiSkillStatus === 'shipped' ? 5 : 0;

    results.push({
      slug: row.slug,
      score: baseScore + reasonBonus + shippedBonus,
      reasons: evaluation.reasons,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.slug.localeCompare(b.slug);
  });

  return results;
}

export type SelectionExplanation = {
  slug: string;
  matched: boolean;
  reasons: string[];
  priorityScore: number;
  totalScore: number | null;
};

export function explainSelection(
  ctx: ReleaseContext,
  catalog: CatalogRow[]
): SelectionExplanation[] {
  return catalog.map(row => {
    let predicate: ApplicabilityPredicate | null = null;
    try {
      predicate = parseApplicabilityRule(row.applicabilityRules);
    } catch {
      return {
        slug: row.slug,
        matched: false,
        reasons: ['invalid_applicability_rule'],
        priorityScore: PRIORITY_SCORE[row.priority] ?? 0,
        totalScore: null,
      };
    }
    const evaluation = compileRule(predicate)(ctx);
    const priorityScore = PRIORITY_SCORE[row.priority] ?? 0;
    const totalScore = evaluation.matched
      ? priorityScore +
        Math.min(evaluation.reasons.length, 5) +
        (row.aiSkillStatus === 'shipped' ? 5 : 0)
      : null;
    return {
      slug: row.slug,
      matched: evaluation.matched,
      reasons: evaluation.reasons,
      priorityScore,
      totalScore,
    };
  });
}
