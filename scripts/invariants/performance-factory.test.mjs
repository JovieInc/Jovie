import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { routeFromPattern } from './performance-budgets.mjs';
import {
  AUDITOR_MODEL,
  alreadyFiled,
  BUDGET_SOURCE_PATHS,
  classifySurface,
  FORBIDDEN_INTERVAL_MINUTES,
  fingerprintViolation,
  GOVERNANCE_WORKFLOW,
  PERFORMANCE_FACTORY_INVARIANT_ID,
  PERFORMANCE_PACK_PATH,
  PERFORMANCE_PACK_SLUG,
  PROTECTED_PULL_REQUEST,
  planLinearIssues,
  projectPerformancePack,
  validateFactoryContract,
  validatePerformanceFactory,
  validatePerformancePack,
  WRITER_MODEL,
} from './performance-factory.mjs';
import { readInvariantRegistry } from './registry.mjs';

const registry = readInvariantRegistry();
const overlay = source =>
  validateFactoryContract(registry, process.cwd(), {
    [GOVERNANCE_WORKFLOW]: source,
  }).join('\n');

describe('JOV-INV-026 performance invariant factory', () => {
  it('binds every admin Lighthouse URL to error-level assertions and its budget route', () => {
    const config = JSON.parse(
      readFileSync('apps/web/.lighthouserc.admin.pr.json', 'utf8')
    );
    const packageJson = JSON.parse(
      readFileSync('apps/web/package.json', 'utf8')
    );
    const script = packageJson.scripts['test:lighthouse:admin:pr'];
    const urls = script
      .match(/LIGHTHOUSE_DASHBOARD_URLS=([^ ]+)/)?.[1]
      .split(',');
    const [adminAssertions] = config.ci.assert.assertMatrix;
    const matcher = new RegExp(adminAssertions.matchingUrlPattern);
    const finalUrls = [
      '/app/ov/growth',
      '/app/ov/people?view=creators',
      '/app/ov/people?view=users',
      '/app/ov/people?view=releases',
    ];

    assert.deepEqual(urls, finalUrls);
    for (const url of finalUrls) {
      assert.equal(matcher.test('https://jov.ie' + url), true, url);
    }
    for (const redirectingUrl of [
      '/app/ov/creators',
      '/app/ov/users',
      '/app/ov/releases',
    ]) {
      assert.equal(matcher.test('https://jov.ie' + redirectingUrl), false);
    }
    assert.equal(
      routeFromPattern(adminAssertions.matchingUrlPattern),
      '/app/ov/*'
    );
    assert.equal(
      adminAssertions.assertions['categories:performance'][0],
      'error'
    );
    const pack = projectPerformancePack();
    for (const url of finalUrls) {
      const violations = planLinearIssues({
        pack,
        measurements: [
          {
            url: `https://jov.ie${url}`,
            source: 'lhci',
            metrics: { performance_score: 0.1 },
          },
        ],
      });
      assert.ok(
        violations.some(
          item =>
            item.fingerprint === 'perf-violation:/app/ov/*:performance_score'
        ),
        `missing OV proposal for ${url}`
      );
    }
  });

  it('accepts the checked-in performance pack', () => {
    assert.deepEqual(validatePerformanceFactory(), []);
    const pack = JSON.parse(readFileSync(PERFORMANCE_PACK_PATH, 'utf8'));
    assert.equal(pack.slug, PERFORMANCE_PACK_SLUG);
    assert.equal(pack.writer, WRITER_MODEL);
    assert.equal(pack.auditor, AUDITOR_MODEL);
    assert.equal(pack.optimizationContract.class, 'non-product');
    assert.equal(classifySurface('/'), 'homepage');
    assert.equal(classifySurface('/app'), 'signed-in-app');
    const lcp = fingerprintViolation('/', 'lcp_ms');
    const first = planLinearIssues({
      pack,
      measurements: [
        { url: 'https://jov.ie/', source: 'live', metrics: { lcp_ms: 8000 } },
      ],
    });
    assert.equal(first[0]?.fingerprint, lcp);
    assert.ok(
      alreadyFiled({ fingerprint: lcp, route: '/', metric: 'lcp_ms' }, first)
    );
  });

  it('rejects invented budgets', () => {
    const pack = projectPerformancePack();
    pack.budgets = [
      ...pack.budgets,
      {
        route: '/invented',
        metric: 'lcp_ms',
        surface: 'homepage',
        direction: 'max',
        budget: 12,
        level: 'error',
        source: 'made-up.json',
        sources: [{ path: 'made-up.json', value: 12, level: 'error' }],
      },
    ];
    assert.match(
      validatePerformancePack(pack, projectPerformancePack()).join('\n'),
      /invented budgets/
    );
  });

  it('rejects a 15-minute beat', () => {
    const source = readFileSync(GOVERNANCE_WORKFLOW, 'utf8');
    assert.match(
      overlay(source.replace("cron: '17 8 * * 1'", "cron: '*/15 * * * *'")),
      /15-minute/
    );
    assert.equal(FORBIDDEN_INTERVAL_MINUTES, 15);
    assert.equal(
      existsSync('.github/workflows/performance-invariants.yml'),
      false
    );
  });

  it('rejects stealing the Kimi remediator', () => {
    const candidate = structuredClone(registry);
    const invariant = candidate.invariants.find(
      item => item.id === PERFORMANCE_FACTORY_INVARIANT_ID
    );
    invariant.policy.value.remediator = 'kimi';
    invariant.enforcementConsumers.push({
      name: 'Kimi remediator',
      path: 'scripts/drain-pr-remediate.mjs',
    });
    assert.match(
      validateFactoryContract(candidate).join('\n'),
      /Kimi remediator/
    );
    assert.ok(
      invariant.policy.value.protectedPullRequests.includes(
        PROTECTED_PULL_REQUEST
      )
    );
    assert.ok(existsSync(BUDGET_SOURCE_PATHS[0]));
  });
});
