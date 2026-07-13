#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ISSUES_FILE = 'apps/web/.issues/sonar-issues-latest.json';

// Rule metadata for batching and prioritization
const RULE_METADATA = {
  // CRITICAL rules
  'typescript:S3735': {
    effort: 1,
    category: 'void-operator',
    description: 'Remove void operator',
    autoFixable: true,
  },
  'typescript:S3776': {
    effort: 8,
    category: 'complexity',
    description: 'Reduce cognitive complexity',
    autoFixable: false,
  },

  // MAJOR rules
  'typescript:S6478': {
    effort: 5,
    category: 'component-nesting',
    description: 'Move component out of parent',
    autoFixable: false,
  },
  'typescript:S3358': {
    effort: 3,
    category: 'ternary',
    description: 'Extract nested ternary',
    autoFixable: false,
  },

  // MINOR rules (top ones)
  'typescript:S6759': {
    effort: 1,
    category: 'prefer-node-protocol',
    description: 'Use node: protocol imports',
    autoFixable: true,
  },
  'typescript:S7764': {
    effort: 1,
    category: 'array-callback-return',
    description: 'Add return in array callback',
    autoFixable: true,
  },
  'typescript:S1874': {
    effort: 2,
    category: 'deprecated-api',
    description: 'Replace deprecated API',
    autoFixable: false,
  },
  'typescript:S7763': {
    effort: 1,
    category: 'no-console',
    description: 'Remove console statement',
    autoFixable: true,
  },
  'typescript:S7735': {
    effort: 1,
    category: 'prefer-const',
    description: 'Use const instead of let',
    autoFixable: true,
  },
  'typescript:S4325': {
    effort: 1,
    category: 'no-var',
    description: 'Use let/const instead of var',
    autoFixable: true,
  },
  'typescript:S7778': {
    effort: 2,
    category: 'no-explicit-any',
    description: 'Avoid explicit any type',
    autoFixable: false,
  },
  'typescript:S6571': {
    effort: 2,
    category: 'prefer-optional-chain',
    description: 'Use optional chaining',
    autoFixable: true,
  },
  'typescript:S6594': {
    effort: 1,
    category: 'no-useless-escape',
    description: 'Remove useless escape',
    autoFixable: true,
  },
  'typescript:S6767': {
    effort: 2,
    category: 'prefer-string-starts-ends',
    description: 'Use startsWith/endsWith',
    autoFixable: true,
  },
};

// Severity weights
const SEVERITY_WEIGHT = {
  CRITICAL: 100,
  MAJOR: 50,
  MINOR: 10,
  INFO: 1,
};

function analyzeIssues() {
  console.log('📊 Analyzing SonarCloud issues...\n');

  const issues = JSON.parse(readFileSync(ISSUES_FILE, 'utf-8'));

  // Calculate priority score for each issue
  const enrichedIssues = issues.map(issue => {
    const rule = RULE_METADATA[issue.rule] || {
      effort: 5,
      category: 'other',
      description: issue.message,
      autoFixable: false,
    };
    const severityWeight = SEVERITY_WEIGHT[issue.severity] || 1;
    const priorityScore = (severityWeight * 10) / rule.effort;

    // Extract file path relative to apps/web
    const component = issue.component.split(':').pop();
    const directory = component.split('/').slice(0, -1).join('/');

    return {
      ...issue,
      ...rule,
      priorityScore,
      component,
      directory,
    };
  });

  // Sort by priority score (highest first)
  enrichedIssues.sort((a, b) => b.priorityScore - a.priorityScore);

  // Group by category for batching
  const byCategory = enrichedIssues.reduce((acc, issue) => {
    const key = issue.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {});

  console.log('📋 Issues by category:\n');
  Object.entries(byCategory)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([category, issues]) => {
      const avgPriority =
        issues.reduce((sum, i) => sum + i.priorityScore, 0) / issues.length;
      const severities = issues.reduce((acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1;
        return acc;
      }, {});
      console.log(`   ${category}: ${issues.length} issues`);
      console.log(`      Priority: ${avgPriority.toFixed(1)}`);
      console.log(
        `      Severities: ${Object.entries(severities)
          .map(([s, c]) => `${s}=${c}`)
          .join(', ')}`
      );
      console.log(
        `      Auto-fixable: ${issues[0].autoFixable ? 'YES' : 'NO'}`
      );
      console.log('');
    });

  // Create batches
  const batches = [];
  let batchId = 1;

  // Strategy 1: CRITICAL issues first (one batch per critical rule)
  const criticalIssues = enrichedIssues.filter(i => i.severity === 'CRITICAL');
  if (criticalIssues.length > 0) {
    const byCriticalRule = criticalIssues.reduce((acc, issue) => {
      if (!acc[issue.rule]) acc[issue.rule] = [];
      acc[issue.rule].push(issue);
      return acc;
    }, {});

    Object.entries(byCriticalRule).forEach(([rule, issues]) => {
      batches.push({
        id: batchId++,
        name: `Critical: ${issues[0].category}`,
        priority: 'CRITICAL',
        issues: issues,
        estimatedMinutes: issues.reduce((sum, i) => sum + i.effort, 0),
        category: issues[0].category,
      });
    });
  }

  // Strategy 2: MAJOR issues (batch by category, max 15 per batch)
  const majorIssues = enrichedIssues.filter(i => i.severity === 'MAJOR');
  if (majorIssues.length > 0) {
    const byMajorCategory = majorIssues.reduce((acc, issue) => {
      if (!acc[issue.category]) acc[issue.category] = [];
      acc[issue.category].push(issue);
      return acc;
    }, {});

    Object.entries(byMajorCategory).forEach(([category, issues]) => {
      // Split into batches of max 15
      for (let i = 0; i < issues.length; i += 15) {
        const batch = issues.slice(i, i + 15);
        batches.push({
          id: batchId++,
          name: `Major: ${category} (${i / 15 + 1})`,
          priority: 'MAJOR',
          issues: batch,
          estimatedMinutes: batch.reduce((sum, i) => sum + i.effort, 0),
          category,
        });
      }
    });
  }

  // Strategy 3: Quick wins - auto-fixable MINOR issues with high volume
  const quickWins = enrichedIssues.filter(
    i => i.severity === 'MINOR' && i.autoFixable
  );
  const byQuickWinCategory = quickWins.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {});

  Object.entries(byQuickWinCategory)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 5) // Top 5 quick win categories
    .forEach(([category, issues]) => {
      // Split into batches of max 15
      for (let i = 0; i < issues.length; i += 15) {
        const batch = issues.slice(i, i + 15);
        batches.push({
          id: batchId++,
          name: `Quick win: ${category} (${i / 15 + 1})`,
          priority: 'QUICK_WIN',
          issues: batch,
          estimatedMinutes: batch.reduce((sum, i) => sum + i.effort, 0),
          category,
        });
      }
    });

  // Strategy 4: Remaining MINOR issues (grouped by category)
  const remainingMinor = enrichedIssues.filter(
    i =>
      i.severity === 'MINOR' &&
      !quickWins.includes(i) &&
      !batches.some(b => b.issues.includes(i))
  );

  const byRemainingCategory = remainingMinor.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {});

  Object.entries(byRemainingCategory)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([category, issues]) => {
      // Split into batches of max 15
      for (let i = 0; i < issues.length; i += 15) {
        const batch = issues.slice(i, i + 15);
        batches.push({
          id: batchId++,
          name: `Minor: ${category} (${i / 15 + 1})`,
          priority: 'MINOR',
          issues: batch,
          estimatedMinutes: batch.reduce((sum, i) => sum + i.effort, 0),
          category,
        });
      }
    });

  // Save batches
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const batchesPath = join('apps/web/.issues', `batches-${timestamp}.json`);
  writeFileSync(batchesPath, JSON.stringify(batches, null, 2));
  console.log(`💾 Saved ${batches.length} batches to: ${batchesPath}\n`);

  const latestBatchesPath = join('apps/web/.issues', 'batches-latest.json');
  writeFileSync(latestBatchesPath, JSON.stringify(batches, null, 2));
  console.log(`💾 Latest: ${latestBatchesPath}\n`);

  // Print batch summary
  console.log('='.repeat(80));
  console.log('📦 BATCH EXECUTION PLAN\n');
  console.log(`Total batches: ${batches.length}`);
  console.log(`Total issues: ${enrichedIssues.length}`);
  console.log(
    `Estimated time: ${batches.reduce((sum, b) => sum + b.estimatedMinutes, 0)} minutes\n`
  );

  console.log('First 10 batches to execute:\n');
  batches.slice(0, 10).forEach(batch => {
    console.log(`Batch #${batch.id}: ${batch.name}`);
    console.log(`   Priority: ${batch.priority}`);
    console.log(`   Issues: ${batch.issues.length}`);
    console.log(`   Estimated time: ${batch.estimatedMinutes} min`);
    console.log(`   Category: ${batch.category}`);
    console.log('');
  });

  console.log('='.repeat(80));
}

analyzeIssues();
